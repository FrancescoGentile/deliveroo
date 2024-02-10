//
//
//

import { HashMap, HashSet, Instant, getRandomInt, shuffle_in_place } from "src/utils";
import { Cryptographer } from "src/utils/crypto";
import { BeliefSet } from "./beliefs";
import { GridMap } from "./map";
import { PddlPlanner } from "./pddl";
import { MonteCarloTreeSearch } from "./planner";
import { Actuators, Messenger, Sensors } from "./ports";
import {
    AgentID,
    AgentSensingMessage,
    Config,
    Direction,
    HelloMessage,
    IgnoreMeMessage,
    Intention,
    IntentionType,
    IntentionUpdateMessage,
    Message,
    MessageType,
    Parcel,
    ParcelID,
    ParcelSensingMessage,
    Position,
    PositionUpdateMessage,
    VisibleAgent,
} from "./structs";

import { linearSumAssignment } from "linear-sum-assignment";

export class Player {
    private readonly _beliefs: BeliefSet;

    private readonly _planner: MonteCarloTreeSearch;

    private readonly _pddlPlanner: PddlPlanner;

    private readonly _sensors: Sensors;

    private readonly _actuators: Actuators;

    private readonly _messenger: Messenger;

    private readonly _cryptographer: Cryptographer;

    private _actualPaths: HashMap<Intention, [Position, Direction[] | null]> = new HashMap();

    private _blockedBottlenecks: [HashSet<Position>, Intention][] = [];

    private _shouldRun = false;

    private _moveIntention: Intention | null = null;

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
        this._beliefs = new BeliefSet(map, id, position);
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
                position: this._beliefs.myPosition,
            });
        }, config.helloInterval.milliseconds);

        this._planner = new MonteCarloTreeSearch(this._beliefs);
        this._pddlPlanner = new PddlPlanner(this._beliefs);

        // Add event listeners.
        this._sensors.onPositionUpdate(this._onLocalPositionUpdate.bind(this));
        this._sensors.onParcelSensing(this._onLocalParcelSensing.bind(this));
        this._sensors.onAgentSensing(this._onLocalAgentSensing.bind(this));

        this._messenger.onHelloMessage(this._onHello.bind(this));
        this._messenger.onPositionUpdateMessage(this._onRemotePositionUpdate.bind(this));
        this._messenger.onParcelSensingMessage(this._onRemoteParcelSensing.bind(this));
        this._messenger.onAgentSensingMessage(this._onRemoteAgentSensing.bind(this));
        this._messenger.onIntentionUpdateMessage(this._onRemoteIntentionUpdate.bind(this));
        this._messenger.onIgnoreMeMessage(this._onIgnoreMe.bind(this));

        this._beliefs.onOccupiedPositionsChange(this._onOccupiedPositionsChange.bind(this));
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

        // before starting the planner, we wait for some time so that we can at least
        // sense some parcels, otherwise running the planners with zero parcels is useless
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // this is to ensure that the planner executes at least some iterations before the player
        // starts moving
        const plannerPromise = this._planner.start();
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
            const action = await this._getNextAction();
            if (action instanceof AgentID) {
                await this._followAgent(action);
            } else {
                await this._performIntention(action);
            }

            console.log("--------------------------------------------");
            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    private async _followAgent(agent: AgentID) {
        let numMoves = 0;
        while (true) {
            console.log("Following agent: ", agent);
            const mate = this._beliefs.getTeamMate(agent);
            const distance = this._beliefs.map.distance(this._beliefs.myPosition, mate.position);
            if (distance <= 2 && numMoves > 0) {
                break;
            }

            const possibleDirections = this._beliefs.map.getNextDirection(
                this._beliefs.myPosition,
                mate.position,
            )!;

            for (const direction of possibleDirections) {
                if (await this._actuators.move(direction)) {
                    this._planner._updatePosition(this._beliefs.myPosition);
                    numMoves += 1;
                    break;
                }
            }
        }

        await this._actuators.putdown(null);
        await this._sendMessage({ type: MessageType.IGNORE, ignore: false });
        const [intentionScores] = this._computeIntentionsScores(Instant.now());
        const message: IntentionUpdateMessage = {
            type: MessageType.INTENTION_UPDATE,
            intentions: intentionScores,
        };
        await this._sendMessage(message);
    }

    private async _performIntention(intention: Intention) {
        console.log("I am here: ", this._beliefs.myPosition);
        console.log("I want to do: ", intention);
        // this._planner.printTree(Instant.now(), this._position);

        let possibleDirections: Direction[];
        if (this._actualPaths.has(intention)) {
            const [position, path] = this._actualPaths.get(intention)!;

            if (path === null) {
                return;
            }

            if (this._beliefs.myPosition.equals(position)) {
                if (path.length === 0) {
                    possibleDirections = [Direction.NONE];
                } else {
                    possibleDirections = [path.shift()!];
                    this._actualPaths.set(intention, [
                        position.moveTo(possibleDirections[0]),
                        path,
                    ]);
                }
            } else {
                possibleDirections = this._beliefs.map.getNextDirection(
                    this._beliefs.myPosition,
                    position,
                )!;
            }
        } else {
            possibleDirections = this._beliefs.map.getNextDirection(
                this._beliefs.myPosition,
                intention.position,
            )!;
        }

        let hasMoved = false;
        for (const direction of possibleDirections) {
            if (await this._actuators.move(direction)) {
                hasMoved = true;
                break;
            }
        }
        let path: Direction[] | null = null;
        if (!hasMoved) {
            if (Config.getPlayerConfig().usePDDL) {
                setTimeout(() => {
                    this._pddlPlanner
                        .getPlan(this._beliefs.myPosition, intention.position)
                        .then((p) => {
                            path = p;
                        })
                        .catch((e) => {
                            console.error("Error in PDDL planner: ", e);
                            path = null;
                        });
                }, 1000);
            } else {
                path = this._beliefs.recomputePath(this._beliefs.myPosition, intention.position);
            }
            this._actualPaths.set(intention, [this._beliefs.myPosition, path]);

            const bottleneck = this._beliefs.computeBottleneck(
                this._beliefs.myPosition,
                intention.position,
            );

            this._blockedBottlenecks.push([bottleneck, intention]);
        } else if (this._beliefs.myPosition.equals(intention.position)) {
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
                case IntentionType.MOVE: {
                    this._moveIntention = null;
                    break;
                }
            }
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
    private async _getNextAction(): Promise<Intention | AgentID> {
        const now = Instant.now();

        const [intentionUtilities, allScoresZero, numPutdowns, numUnreachablePutdowns] =
            this._computeIntentionsScores(now);

        const message: IntentionUpdateMessage = {
            type: MessageType.INTENTION_UPDATE,
            intentions: intentionUtilities,
        };
        await this._sendMessage(message);

        if (allScoresZero && numPutdowns > 0) {
            console.log("I cannot do the putdown");

            if (numUnreachablePutdowns < numPutdowns) {
                console.log("Some putdown are reachable, but I decide to ignore them and move.");
                return this._getBestMoveIntention();
            }

            if (numPutdowns < this._beliefs.map.deliveryTiles.length) {
                console.log("Let's first check if we can do some putdowns.");
                this._planner.addAllPutdownIntentions();
                return this._getBestMoveIntention();
            }

            if (this._planner.getCarryingParcels().length === 0) {
                console.log("I am not carrying any parcels, so I will move.");
                return this._getBestMoveIntention();
            }

            console.log("I cannot do any putdown, so I will follow a team mate.");
            // all possible putdown intentions are blocked
            // so we follow the closest team mate and we give them the parcels
            const closestTeamMate = this._findClosestTeamMate();
            if (closestTeamMate === null) {
                return this._getBestMoveIntention();
            }

            await this._sendMessage({ type: MessageType.IGNORE, ignore: true });
            const carryingParcels = this._planner.removeCarryingParcels();
            this._beliefs.addIgnoredParcels(carryingParcels);
            return closestTeamMate;
        }

        const [mateToIdx, intentionToIdx, idxToIntention] = this._computeIntentionMateMaps(
            intentionUtilities,
            now,
        );

        const matrix = this._computeCostMatrix(mateToIdx, intentionToIdx, intentionUtilities);
        const result = linearSumAssignment(matrix, { maximaze: true });
        // for (const [idx, intention] of idxToIntention.entries()) {
        //     console.log(`${idx}: ${intention}`);
        // }
        // console.log(matrix);
        // console.log(result.columnAssignments);

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
            this._moveIntention = null;
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
     * @param now The instant at which the utilities should be computed.
     *
     * @returns
     */
    private _computeIntentionsScores(
        now: Instant,
    ): [[Intention, number][], boolean, number, number] {
        const intentionUtilityPairs = this._planner.getIntentionUtilities();
        const { movementDuration } = Config.getEnvironmentConfig();

        const intentionScores: [Intention, number][] = [];
        let allScoresZero = true;
        let numPutdowns = 0;
        let numUnreachablePutdowns = 0;

        for (const [intention, utility] of intentionUtilityPairs) {
            if (intention.type === IntentionType.PUTDOWN) {
                numPutdowns += 1;
            }

            let distance: number;
            if (this._actualPaths.has(intention)) {
                const [position, path] = this._actualPaths.get(intention)!;
                if (path === null) {
                    intentionScores.push([intention, 0]);
                    if (intention.type === IntentionType.PUTDOWN) {
                        numUnreachablePutdowns += 1;
                    }

                    continue;
                }

                distance =
                    this._beliefs.map.distance(this._beliefs.myPosition, position) + path.length;
            } else {
                distance = this._beliefs.map.distance(this._beliefs.myPosition, intention.position);
            }

            const arrivalInstant = now.add(movementDuration.multiply(distance));
            let score = utility.getValueByInstant(arrivalInstant, this._beliefs.parcelDiscounts);

            if (intention.type === IntentionType.PICKUP) {
                // Reduce the score of a pickup intention if there is another agent (excluding random agents
                // and teammates) closer to the pickup position.
                let minEnemyDistance = Number.POSITIVE_INFINITY;
                for (const agent of this._beliefs.getAgents(false)) {
                    if (agent.random) {
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

            intentionScores.push([intention, score]);
            if (score !== 0) {
                allScoresZero = false;
            }
        }

        return [intentionScores, allScoresZero, numPutdowns, numUnreachablePutdowns];
    }

    private _computeIntentionMateMaps(
        intentionUtilities: [Intention, number][],
        now: Instant,
    ): [HashMap<AgentID, number>, HashMap<Intention, number>, Map<number, Intention>] {
        const mateToIdx = new HashMap<AgentID, number>();
        const intentionToIdx = new HashMap<Intention, number>();
        const idxToIntention = new Map<number, Intention>();

        let mateIdx = 1; // 0 is reserved for the player
        let intentionIdx = 0;
        for (const [intention] of intentionUtilities) {
            if (!intentionToIdx.has(intention)) {
                intentionToIdx.set(intention, intentionIdx);
                idxToIntention.set(intentionIdx, intention);
                intentionIdx += 1;
            }
        }

        for (const [agentID, mate] of this._beliefs.getTeamMates()) {
            if (mate.ignore) {
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

        return [mateToIdx, intentionToIdx, idxToIntention];
    }

    private _computeCostMatrix(
        mateToIdx: HashMap<AgentID, number>,
        intentionToIdx: HashMap<Intention, number>,
        intentionUtilities: [Intention, number][],
    ): number[][] {
        const matrix: number[][] = [];
        // mateToIdx + 1 because the first row is for the player
        for (let i = 0; i < mateToIdx.size + 1; i++) {
            matrix.push(new Array(intentionToIdx.size).fill(0));
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

        // console.log("OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO");
        // for (const [intention, idx] of intentionToIdx.entries()) {
        //     console.log(`${idx}: ${intention}`);
        // }
        // console.log("Cost matrix:");
        // for (const row of matrix) {
        //     console.log(row);
        // }
        // console.log("OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO");

        return matrix;
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
        if (this._moveIntention !== null) {
            if (this._actualPaths.has(this._moveIntention)) {
                const [, path] = this._actualPaths.get(this._moveIntention)!;
                if (path !== null) {
                    return this._moveIntention;
                }
            } else {
                return this._moveIntention;
            }
        }

        const promisingPositions = this._beliefs.getPromisingPositions(
            this._beliefs.myPosition,
            Config.getPlayerConfig().numPromisingPositions,
        );
        // If all promising positions have the same value, we shuffle them so that the player
        // does not always choose the same position (i.e., the first one in the list).
        shuffle_in_place(promisingPositions);

        let bestIntention: Intention | null = null;
        let bestReward = Number.NEGATIVE_INFINITY;

        for (const [position, value] of promisingPositions) {
            const intention = Intention.move(position);
            if (this._actualPaths.has(intention)) {
                const [, path] = this._actualPaths.get(Intention.move(position))!;
                if (path === null) {
                    continue;
                }
            }

            if (value > bestReward) {
                bestIntention = intention;
                bestReward = value;
            }
        }

        if (bestIntention === null) {
            const idx = getRandomInt(this._beliefs.map.tiles.length);
            const position = this._beliefs.map.tiles[idx].position;
            bestIntention = Intention.move(position);
        }

        this._moveIntention = bestIntention;
        return bestIntention;
    }

    private _findClosestTeamMate(): AgentID | null {
        let closestTeamMate: AgentID | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        for (const [agentID, mate] of this._beliefs.getTeamMates()) {
            if (mate.ignore) {
                continue;
            }

            const distance = this._beliefs.map.distanceIfPossible(
                this._beliefs.myPosition,
                mate.position,
            );
            if (distance === null) {
                continue;
            }

            if (distance < closestDistance) {
                closestTeamMate = agentID;
                closestDistance = distance;
            }
        }

        return closestTeamMate;
    }

    private async _sendMessage(message: Message) {
        const mates = this._beliefs.getTeamMates().map(([id]) => id);
        switch (message.type) {
            case MessageType.POSITION_UPDATE: {
                await Promise.all(
                    mates.map((agentID) => {
                        return this._messenger.sendPositionUpdateMessage(agentID, message);
                    }),
                );
                break;
            }
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
            case MessageType.IGNORE: {
                await Promise.all(
                    mates.map((agentID) => {
                        return this._messenger.sendIgnoreMeMessage(agentID, message);
                    }),
                );
                break;
            }
            default: {
                // This should never happen
                throw new Error("Trying to send an unknown message type.");
            }
        }
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
            this._beliefs.addTeamMate(sender, message.position);
        } else {
            // The sender is not who it claims to be. This could be due to an error or a malicious agent.
            // Since this is a demo, we just ignore the message, but in a real scenario we should
            // handle this case.
        }
    }

    private async _onLocalPositionUpdate(position: Position) {
        // Since the movement is not instantaneous, as soon as the agent performs a movement, its
        // position is in between two tiles and only at the end it will be equal to the new tile.
        // To avoid having to deal with intermediate positions, we always set the position
        // to the position of the new tile (in some edge cases, this may lead to some inconsistencies,
        // that are only temporary so we can ignore them).

        // Since the position is always set to the position of the new tile, we can avoid sending
        // the same message when the agent effectively reaches the new tile.
        if (position.equals(this._beliefs.myPosition)) {
            return;
        }

        this._beliefs.updateMyPosition(
            new Position(Math.round(position.row), Math.round(position.column)),
        );

        const message: PositionUpdateMessage = {
            type: MessageType.POSITION_UPDATE,
            position: this._beliefs.myPosition,
        };

        await this._sendMessage(message);
    }

    private async _onRemotePositionUpdate(sender: AgentID, message: PositionUpdateMessage) {
        if (!this._beliefs.isTeamMate(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._beliefs.updateTeamMatePosition(sender, message.position);
    }

    /**
     * Handles a parcel sensing event emitted by the local sensors.
     *
     * @param parcels The parcels that were sensed.
     */
    private async _onLocalParcelSensing(parcels: Parcel[]) {
        this._beliefs.updateParcels(parcels, this._beliefs.myID);

        const message: ParcelSensingMessage = {
            type: MessageType.PARCEL_SENSING,
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

        this._beliefs.updateParcels(message.parcels, sender);
    }

    /**
     * Handles an agent sensing event emitted by the local sensors.
     *
     * @param agents The agents that were sensed.
     */
    private async _onLocalAgentSensing(agents: VisibleAgent[]) {
        this._beliefs.updateAgents(agents, this._beliefs.myID);

        const message: AgentSensingMessage = {
            type: MessageType.AGENT_SENSING,
            agents,
        };

        await this._sendMessage(message);
    }

    private _onRemoteAgentSensing(sender: AgentID, message: AgentSensingMessage) {
        if (!this._beliefs.isTeamMate(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._beliefs.updateAgents(message.agents, sender);
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

    private _onIgnoreMe(sender: AgentID, message: IgnoreMeMessage) {
        if (!this._beliefs.isTeamMate(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._beliefs.updateTeamMateIgnore(sender, message.ignore);
    }

    private _onOccupiedPositionsChange() {
        if (this._moveIntention !== null) {
            if (this._beliefs.isPositionOccupied(this._moveIntention.position)) {
                this._moveIntention = null;
            }
        }

        const oldActualPaths = this._actualPaths;
        const oldBlockedBottlenecks = this._blockedBottlenecks;

        const newActualPaths: HashMap<Intention, [Position, Direction[] | null]> = new HashMap();
        const newBlockedBottlenecks: [HashSet<Position>, Intention][] = [];

        const alreadyAdded: boolean[] = new Array(oldBlockedBottlenecks.length).fill(false);

        // console.log("------");
        for (const agent of this._beliefs.getAgents()) {
            // console.log("Visible agent: ", agent);
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
        // console.log("Blocked bottlenecks:");
        // for (const [bottleneck, intention] of newBlockedBottlenecks) {
        //     console.log("Bottleneck: ", intention, bottleneck);
        // }
        // console.log("------");
    }
}
