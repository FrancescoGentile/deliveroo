//
//
//

import { HashMap, HashSet, Instant } from "src/utils";
import { Cryptographer } from "src/utils/crypto";
import { BeliefSet } from "./beliefs";
import { GridMap } from "./map";
import { MonteCarloTreeSearch } from "./planner";
import { Actuators, Messenger, Sensors } from "./ports";
import {
    Agent,
    AgentID,
    AgentSensingMessage,
    Config,
    DecayingValue,
    Direction,
    HelloMessage,
    Intention,
    IntentionType,
    IntentionUpdateMessage,
    Message,
    MessageType,
    Parcel,
    ParcelID,
    ParcelSensingMessage,
    Position,
} from "./structs";

import { linearSumAssignment } from "linear-sum-assignment";

export class Player {
    private readonly _beliefs: BeliefSet;

    private readonly _planner: MonteCarloTreeSearch;

    private _position: Position;

    private readonly _sensors: Sensors;

    private readonly _actuators: Actuators;

    private readonly _messenger: Messenger;

    private readonly _cryptographer: Cryptographer;

    private _actualPaths: HashMap<Intention, [Position, Direction[] | null]> = new HashMap();

    private _blockedBottlenecks: [HashSet<Position>, Intention][] = [];

    private _shouldRun = false;

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    public constructor(
        map: GridMap,
        id: AgentID,
        position: Position,
        sensors: Sensors,
        actuators: Actuators,
        messenger: Messenger,
    ) {
        this._beliefs = new BeliefSet(map, id);
        this._position = position;
        this._sensors = sensors;
        this._actuators = actuators;
        this._messenger = messenger;

        const config = Config.getPlayerConfig();
        this._cryptographer = new Cryptographer(config.secretKey, config.secretSeed);

        const ciphered_id = this._cryptographer.encrypt(id.serialize());
        setInterval(() => {
            messenger.shoutHelloMessage({
                type: MessageType.HELLO,
                ciphered_id,
            });
        }, config.helloInterval.milliseconds);

        this._planner = new MonteCarloTreeSearch(this._beliefs);

        // Add event listeners.
        this._sensors.onParcelSensing(this._onLocalParcelSensing.bind(this));
        this._sensors.onAgentSensing(this._onLocalAgentSensing.bind(this));

        this._messenger.onHelloMessage(this._onHello.bind(this));
        this._messenger.onParcelSensingMessage(this._onRemoteParcelSensing.bind(this));
        this._messenger.onIntentionUpdateMessage(this._onRemoteIntentionUpdate.bind(this));

        this._beliefs.onOccupiedPositionsChange(() => this._onOccupiedPositionsChange());
    }

    // -----------------------------------------------------------------------
    // Public methods
    // -----------------------------------------------------------------------

    /**
     * Starts the player.
     * To stop the player, call stop().
     */
    public async start() {
        this._shouldRun = true;

        // this is to ensure that the planner executes at least some iterations before the player
        // starts moving
        const plannerPromise = this._planner.start(this._position);
        for (let i = 0; i < Config.getPlayerConfig().startIterations; i++) {
            this._planner.runIteration();
        }

        await Promise.all([plannerPromise, this._run()]);
    }

    /**
     * Stops the player.
     */
    public stop() {
        this._planner.stop();
        this._shouldRun = false;
    }

    // -----------------------------------------------------------------------
    // Player loop
    // -----------------------------------------------------------------------

    /**
     * Main loop of the player.
     * For each iteration, the player will:
     * 1. Get the best intention from the planner.
     * 2. Move to the position of the intention.
     * 3. Execute the intention if the player is in the same position as the intention.
     *
     * This method will run until stop() is called.
     */
    private async _run() {
        while (this._shouldRun) {
            const intention = await this._getBestIntention();
            console.log(intention);

            this._planner.printTree(Instant.now(), this._position);

            let possibleDirections: Direction[];
            if (this._actualPaths.has(intention)) {
                const [position, path] = this._actualPaths.get(intention)!;

                if (path === null) {
                    throw new Error("Path is null");
                }

                if (this._position.equals(position)) {
                    possibleDirections = [path.shift()!];
                    this._actualPaths.set(intention, [
                        position.moveTo(possibleDirections[0]),
                        path,
                    ]);
                } else {
                    possibleDirections = this._beliefs.map.getNextDirection(
                        this._position,
                        position,
                    )!;
                }
            } else {
                possibleDirections = this._beliefs.map.getNextDirection(
                    this._position,
                    intention.position,
                )!;
            }

            let hasMoved = false;
            for (const direction of possibleDirections) {
                if (await this._actuators.move(direction)) {
                    this._position = this._position.moveTo(direction);
                    this._planner.updatePosition(this._position);
                    hasMoved = true;
                    break;
                }
            }

            if (!hasMoved) {
                const path = this._beliefs.recomputePath(this._position, intention.position);
                this._actualPaths.set(intention, [this._position, path]);

                const bottleneck = this._beliefs.computeBottleneck(
                    this._position,
                    intention.position,
                );

                this._blockedBottlenecks.push([bottleneck, intention]);
            }

            if (this._position.equals(intention.position)) {
                this._actualPaths.delete(intention);
                switch (intention.type) {
                    case IntentionType.PICKUP: {
                        await this._actuators.pickup();
                        this._planner.executeIntention(intention);
                        break;
                    }
                    case IntentionType.PUTDOWN: {
                        await this._actuators.putdown(null);
                        this._planner.executeIntention(intention);
                        break;
                    }
                }
            }

            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    /**
     * Gets the best intention given the current state of the player and the team.
     * In particular, this method will:
     * 1. Compute the utility of each intention that the player can execute.
     * 2. Based on this and on the utilities of the intentions reported by the other members of the team,
     *   compute the best assignment of intentions to each active member of the team.
     * 3. If the player is assigned an intention that has an utility greater than 0, return that intention.
     * 4. Otherwise, compute the best move intention that the player can execute and return it.
     */
    private async _getBestIntention(): Promise<Intention> {
        const now = Instant.now();
        const { maxLastHeard } = Config.getPlayerConfig();

        const mateToIdx = new HashMap<AgentID, number>();
        const intentionToIdx = new HashMap<Intention, number>();
        const idxToIntention = new Map<number, Intention>();

        let mateIdx = 1; // 0 is reserved for the player
        let intentionIdx = 0;

        const intentionUtilities = this._computeIntentionsScores(now);
        const message: IntentionUpdateMessage = {
            type: MessageType.INTENTION_UPDATE,
            intentions: intentionUtilities,
        };
        await this._sendMessage(message);

        for (const [intention] of intentionUtilities) {
            if (!intentionToIdx.has(intention)) {
                intentionToIdx.set(intention, intentionIdx);
                idxToIntention.set(intentionIdx, intention);
                intentionIdx += 1;
            } else {
                // This should never happen. If it does, it means that there is a bug in the planner.
                throw new Error("Intention already exists.");
            }
        }

        mateIdx += 1;
        for (const [agentID, mate] of this._beliefs.getTeamMates()) {
            if (now.subtract(mate.lastHeard).milliseconds > maxLastHeard.milliseconds) {
                continue;
            }

            mateToIdx.set(agentID, mateIdx);
            mateIdx += 1;

            for (const [intention] of mate.intentions) {
                if (!intentionToIdx.has(intention)) {
                    intentionToIdx.set(intention, intentionIdx);
                    idxToIntention.set(intentionIdx, intention);
                    intentionIdx += 1;
                }
            }
        }

        const matrix: number[][] = [];
        for (let i = 0; i < mateIdx; i++) {
            matrix.push(new Array(intentionIdx).fill(0));
        }

        for (const [intention, utility] of intentionUtilities) {
            matrix[0][intentionToIdx.get(intention)!] = utility;
        }

        for (const [agentID, idx] of mateToIdx.entries()) {
            const mate = this._beliefs.getTeamMate(agentID);
            for (const [intention, utility] of mate.intentions) {
                matrix[idx][intentionToIdx.get(intention)!] = utility;
            }
        }

        const result = linearSumAssignment(matrix, { maximaze: true });

        const newParcelDiscounts = new HashMap<ParcelID, number>();
        const columnAssignments = result.columnAssignments;
        const { discountFactor } = Config.getPlayerConfig();
        for (let i = 0; i < columnAssignments.length; i += 1) {
            const intention = idxToIntention.get(i)!;
            if (intention.type !== IntentionType.PICKUP) {
                continue;
            }

            const assignedTo = columnAssignments[i];
            if (assignedTo < 0) {
                continue;
            }

            const factor = assignedTo > 0 ? discountFactor : -discountFactor;
            for (const parcel of this._beliefs.getParcelsByPosition(intention.position)) {
                const oldFactor = this._beliefs.parcelDiscounts.get(parcel.id) ?? 1;
                newParcelDiscounts.set(parcel.id, oldFactor + oldFactor * factor);
            }
        }
        this._beliefs.parcelDiscounts = newParcelDiscounts;

        const assignment = result.rowAssignments[0];
        if (assignment >= 0 && matrix[0][assignment] > 0) {
            return idxToIntention.get(assignment)!;
        }

        // For now we just return the best move intention that the player can execute without
        // taking into consideration the intentions of the other members of the team.
        // For example, if another team member is going into a certain position to perform its
        // assigned intention, the player should not go to that same area.
        return this._getBestMoveIntention();
    }

    /**
     * Computes the utilities of the intentions that the player can execute.
     *
     * @param instant The instant at which the utilities should be computed.
     *
     * @returns
     */
    private _computeIntentionsScores(instant: Instant): [Intention, number][] {
        const intentionUtilityPairs = this._planner.getIntentionUtilities();
        const { movementDuration } = Config.getEnvironmentConfig();

        return intentionUtilityPairs.map(([intention, utility, visits]) => {
            const distance = this._beliefs.map.distance(this._position, intention.position);
            const arrivalInstant = instant.add(movementDuration.multiply(distance));
            let score = utility.getValueByInstant(arrivalInstant, this._beliefs.parcelDiscounts);
            score /= visits;

            if (intention.type === IntentionType.PICKUP) {
                let minEnemyDistance = Number.POSITIVE_INFINITY;
                for (const agent of this._beliefs.getVisibleAgents()) {
                    if (agent.random || this._beliefs.isTeamMate(agent.id)) {
                        continue;
                    }

                    const enemyDistance = this._beliefs.map.distance(
                        intention.position,
                        agent.position,
                    );
                    minEnemyDistance = Math.min(minEnemyDistance, enemyDistance);
                }

                if (minEnemyDistance < distance) {
                    const factor = 1 - 1 / (1 + minEnemyDistance);
                    score *= factor ** 2;
                }
            }

            return [intention, score];
        });
    }

    /**
     * Gets the best move intention that the player can execute at the current state.
     * This method will:
     * 1. Get the most promising positions in the map, i.e., the positions whose expected reward
     *  is the highest. For further details, {@link BeliefSet.getPromisingPositions}.
     * 2. For each of these positions, compute the expected utility of moving to that position,
     * picking up a parcel with the previously computed expected reward, and then delivering the
     * parcel to the closest delivery point.
     * 3. Return the intention that maximizes the expected utility.
     *
     * @returns The best move intention.
     */
    private _getBestMoveIntention(): Intention {
        const promisingPositions = this._beliefs.getPromisingPositions(
            this._position,
            Config.getPlayerConfig().numPromisingPositions,
        );

        let bestIntention: Intention | null = null;
        let bestReward = Number.NEGATIVE_INFINITY;

        const now = Instant.now();
        const { movementDuration } = Config.getEnvironmentConfig();
        for (const [position, value] of promisingPositions) {
            const distanceToIntention = this._beliefs.map.distance(this._position, position);
            const distanceToDelivery = this._beliefs.map.distanceToDelivery(position);
            const totalDistance = distanceToIntention + distanceToDelivery;

            const arrivalInstant = now.add(movementDuration.multiply(totalDistance));

            const reward = new DecayingValue(value, now).getValueByInstant(arrivalInstant);

            if (reward > bestReward) {
                bestIntention = Intention.move(position);
                bestReward = reward;
            }
        }

        if (bestIntention === null) {
            // This should never happen.
            throw new Error("No best movement intention found.");
        }

        return bestIntention;
    }

    private async _sendMessage(message: Message) {
        const mates = this._beliefs.getTeamMates().map(([id]) => id);
        switch (message.type) {
            case MessageType.PARCEL_SENSING: {
                await Promise.all(
                    mates.map((agentID) => {
                        return this._messenger.sendParcelSensingMessage(agentID, message);
                    }),
                );
                break;
            }
            case MessageType.AGENT_SENSING: {
                await Promise.all(
                    mates.map((agentID) => {
                        return this._messenger.sendAgentSensingMessage(agentID, message);
                    }),
                );
                break;
            }
            case MessageType.INTENTION_UPDATE: {
                await Promise.all(
                    mates.map((agentID) => {
                        return this._messenger.sendIntentionUpdateMessage(agentID, message);
                    }),
                );
                break;
            }
        }
    }

    private _onOccupiedPositionsChange() {
        const oldActualPaths = this._actualPaths;
        const oldBlockedBottlenecks = this._blockedBottlenecks;

        const newActualPaths: HashMap<Intention, [Position, Direction[] | null]> = new HashMap();
        const newBlockedBottlenecks: [HashSet<Position>, Intention][] = [];

        const alreadyAdded: boolean[] = new Array(oldBlockedBottlenecks.length).fill(false);

        for (const agent of this._beliefs.getVisibleAgents()) {
            for (const [idx, [bottleneck, intention]] of oldBlockedBottlenecks.entries()) {
                if (bottleneck.has(agent.position)) {
                    if (oldActualPaths.has(intention)) {
                        newActualPaths.set(intention, oldActualPaths.get(intention)!);

                        if (!alreadyAdded[idx]) {
                            newBlockedBottlenecks.push([bottleneck, intention]);
                            alreadyAdded[idx] = true;
                        }
                    }
                }
            }
        }

        this._actualPaths = newActualPaths;
        this._blockedBottlenecks = newBlockedBottlenecks;
    }

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------

    /**
     * Handles a hello message.
     *
     * @param sender The agent that sent the message.
     * @param message The message.
     */
    private _onHello(sender: AgentID, message: HelloMessage) {
        if (this._beliefs.isTeamMate(sender)) {
            this._beliefs.updateTeamMateActivity(sender);
        } else if (this._cryptographer.decrypt(message.ciphered_id) === sender.serialize()) {
            this._beliefs.addTeamMate(sender);
        } else {
            // The sender is not who it claims to be. This could be due to an error or a malicious agent.
            // Since this is a demo, we just ignore the message, but in a real scenario we should
            // handle this case.
        }
    }

    /**
     * Handles a parcel sensing event emitted by the local sensors.
     *
     * @param parcels The parcels that were sensed.
     */
    private async _onLocalParcelSensing(parcels: Parcel[]) {
        this._beliefs.updateParcels(parcels, this._position);

        const message: ParcelSensingMessage = {
            type: MessageType.PARCEL_SENSING,
            position: this._position,
            parcels,
        };

        await this._sendMessage(message);
    }

    /**
     * Handles a parcel sensing message received from another agent.
     *
     * @param sender The agent that sent the message.
     * @param message The message.
     */
    private _onRemoteParcelSensing(sender: AgentID, message: ParcelSensingMessage) {
        if (!this._beliefs.isTeamMate(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._beliefs.updateParcels(message.parcels, message.position);
        this._beliefs.updateTeamMatePosition(sender, message.position);
    }

    /**
     * Handles an agent sensing event emitted by the local sensors.
     *
     * @param agents The agents that were sensed.
     */
    private async _onLocalAgentSensing(agents: Agent[]) {
        this._beliefs.updateAgents(agents, this._position, this._beliefs.myID);

        const message: AgentSensingMessage = {
            type: MessageType.AGENT_SENSING,
            position: this._position,
            agents,
        };

        await this._sendMessage(message);
    }

    private _onRemoteAgentSensing(sender: AgentID, message: AgentSensingMessage) {
        if (!this._beliefs.isTeamMate(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._beliefs.updateAgents(message.agents, message.position, sender);
        this._beliefs.updateTeamMatePosition(sender, message.position);
    }

    /**
     * Handles an intention update message received from another agent.
     *
     * @param sender The agent that sent the message.
     * @param message The message.
     */
    private _onRemoteIntentionUpdate(sender: AgentID, message: IntentionUpdateMessage) {
        if (!this._beliefs.isTeamMate(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._beliefs.updateTeamMateIntentions(sender, message.intentions);
    }
}
