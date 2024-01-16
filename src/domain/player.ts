//
//
//

import math from "mathjs";
import { HashMap, Instant } from "src/utils";
import { Cryptographer } from "src/utils/crypto";
import { Environment } from "./environment";
import { NotImplementedError } from "./errors";
import { GridMap } from "./map";
import { MonteCarloTreeSearch } from "./planner";
import { Actuators, Messenger, Sensors } from "./ports";
import {
    Agent,
    AgentID,
    AgentSensingMessage,
    Config,
    DecayingValue,
    HelloMessage,
    Intention,
    IntentionType,
    IntentionUpdateMessage,
    MessageType,
    Parcel,
    ParcelSensingMessage,
    Position,
} from "./structs";

import { linearSumAssignment } from "linear-sum-assignment";

interface TeamMate {
    position: Position;
    lastHeard: Instant;
    intentions: [Intention, number][];
}

export class Player {
    private readonly _environment: Environment;

    private readonly _planner: MonteCarloTreeSearch;

    private _position: Position;

    private readonly _team: HashMap<AgentID, TeamMate> = new HashMap();

    private readonly _sensors: Sensors;

    private readonly _actuators: Actuators;

    private readonly _messenger: Messenger;

    private readonly _cryptographer: Cryptographer;

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
        this._environment = new Environment(map);
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

        this._planner = new MonteCarloTreeSearch(this._environment);

        // Add event listeners.
        this._sensors.onParcelSensing(this._onLocalParcelSensing.bind(this));
        this._sensors.onAgentSensing(this._onLocalAgentSensing.bind(this));

        this._messenger.onHelloMessage(this._onHello.bind(this));
        this._messenger.onParcelSensingMessage(this._onRemoteParcelSensing.bind(this));
        this._messenger.onIntentionUpdateMessage(this._onRemoteIntentionUpdate.bind(this));
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
            const intention = this._getBestIntention();
            const possibleDirections = this._environment.map.getNextDirection(
                this._position,
                intention.position,
            );

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
                throw new NotImplementedError();
            }

            if (this._position.equals(intention.position)) {
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
    private _getBestIntention(): Intention {
        const now = Instant.now();
        const { maxLastHeard } = Config.getPlayerConfig();

        const mateToIdx = new HashMap<AgentID, number>();
        const intentionToIdx = new HashMap<Intention, number>();
        const idxToIntention = new Map<number, Intention>();

        let mateIdx = 1; // 0 is reserved for the player
        let intentionIdx = 0;

        const intentionUtilities = this._planner.computeIntentionUtilities(now);
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
        for (const [agentID, mate] of this._team.entries()) {
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

        const matrix = math.zeros([mateIdx, intentionIdx]) as math.Matrix;
        for (const [intention, utility] of intentionUtilities) {
            matrix.set([0, intentionToIdx.get(intention)!], utility);
        }

        for (const [agentID, idx] of mateToIdx.entries()) {
            const mate = this._team.get(agentID)!;
            for (const [intention, utility] of mate.intentions) {
                matrix.set([idx, intentionToIdx.get(intention)!], utility);
            }
        }

        const result = linearSumAssignment(matrix.toArray() as number[][], { maximaze: true });
        const assignment = result.rowAssignments[0];
        if (assignment >= 0 && matrix.get([0, assignment]) > 0) {
            return idxToIntention.get(assignment)!;
        }

        // For now we just return the best move intention that the player can execute without
        // taking into consideration the intentions of the other members of the team.
        // For example, if another team member is going into a certain position to perform its
        // assigned intention, the player should not go to that same area.
        return this._getBestMoveIntention();
    }

    /**
     * Gets the best move intention that the player can execute at the current state.
     * This method will:
     * 1. Get the most promising positions in the map, i.e., the positions whose expected reward
     *  is the highest. For further details, {@link Environment.getPromisingPositions}.
     * 2. For each of these positions, compute the expected utility of moving to that position,
     * picking up a parcel with the previously computed expected reward, and then delivering the
     * parcel to the closest delivery point.
     * 3. Return the intention that maximizes the expected utility.
     *
     * @returns The best move intention.
     */
    private _getBestMoveIntention(): Intention {
        const promisingPositions = this._environment.getPromisingPositions(
            this._position,
            Config.getPlayerConfig().numPromisingPositions,
        );

        let bestIntention: Intention | null = null;
        let bestReward = Number.NEGATIVE_INFINITY;

        const now = Instant.now();
        const { movementDuration } = Config.getEnvironmentConfig();
        for (const [position, value] of promisingPositions) {
            const distanceToIntention = this._environment.map.distance(this._position, position);
            const distanceToDelivery = this._environment.map.distanceToDelivery(position);
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
        if (this._team.has(sender)) {
            const mate = this._team.get(sender)!;
            mate.lastHeard = Instant.now();
        } else if (this._cryptographer.decrypt(message.ciphered_id) === sender.serialize()) {
            const mate: TeamMate = {
                position: new Position(0, 0), // Here we can use any position since it will be updated later.
                lastHeard: Instant.now(),
                intentions: [],
            };
            this._team.set(sender, mate);
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
        this._environment.updateParcels(parcels, this._position);

        const message: ParcelSensingMessage = {
            type: MessageType.PARCEL_SENSING,
            position: this._position,
            parcels,
        };

        await Promise.all(
            Array.from(this._team.keys()).map((agentID) => {
                return this._messenger.sendParcelSensingMessage(agentID, message);
            }),
        );
    }

    /**
     * Handles a parcel sensing message received from another agent.
     *
     * @param sender The agent that sent the message.
     * @param message The message.
     */
    private _onRemoteParcelSensing(sender: AgentID, message: ParcelSensingMessage) {
        if (!this._team.has(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._environment.updateParcels(message.parcels, message.position);
        const mate = this._team.get(sender)!;
        mate.position = message.position;
        mate.lastHeard = Instant.now();
    }

    /**
     * Handles an agent sensing event emitted by the local sensors.
     *
     * @param agents The agents that were sensed.
     */
    private async _onLocalAgentSensing(agents: Agent[]) {
        this._environment.updateAgents(agents, this._position);

        const message: AgentSensingMessage = {
            type: MessageType.AGENT_SENSING,
            position: this._position,
            agents,
        };

        await Promise.all(
            Array.from(this._team.keys()).map((agentID) => {
                return this._messenger.sendAgentSensingMessage(agentID, message);
            }),
        );
    }

    private _onRemoteAgentSensing(sender: AgentID, message: AgentSensingMessage) {
        if (!this._team.has(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        this._environment.updateAgents(message.agents, message.position);
        const mate = this._team.get(sender)!;
        mate.position = message.position;
        mate.lastHeard = Instant.now();
    }

    /**
     * Handles an intention update message received from another agent.
     *
     * @param sender The agent that sent the message.
     * @param message The message.
     */
    private _onRemoteIntentionUpdate(sender: AgentID, message: IntentionUpdateMessage) {
        if (!this._team.has(sender)) {
            // If we don't know the sender, we ignore the message since it may be a malicious agent.
            return;
        }

        const mate = this._team.get(sender)!;
        mate.lastHeard = Instant.now();
        mate.intentions = message.intentions;
    }
}
