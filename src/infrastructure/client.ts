//
//
//

import { Socket, io } from "socket.io-client";
import { UnknownMessageError } from "src/domain/errors";

import { Actuators, Messenger, Sensors } from "src/domain/ports";
import {
    Agent,
    AgentID,
    AgentSensingMessage,
    DecayingValue,
    Direction,
    EnvironmentConfig,
    HelloMessage,
    IgnoreMeMessage,
    IntentionUpdateMessage,
    MessageType,
    Parcel,
    ParcelID,
    ParcelSensingMessage,
    Position,
    PositionUpdateMessage,
    Tile,
    VisibleAgent,
    deserializeMessage,
    serializeMessage,
} from "src/domain/structs";

import { Duration, HashSet, Instant, sleep } from "src/utils";

export class SocketIOClient implements Actuators, Sensors, Messenger {
    private readonly _socket: Socket;

    private _agentPosition?: Position;

    private _agentID?: AgentID;

    private _crossableTiles?: Tile[];

    private _config?: EnvironmentConfig;

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    public constructor(host: string, token: string) {
        this._socket = io(host, {
            extraHeaders: {
                "x-token": token,
            },
            autoConnect: true,
        });

        this._socket.on("you", this._setAgentInfo.bind(this));
        this._socket.once("map", this._setCrossableTiles.bind(this));
        this._socket.once("config", this._setConfig.bind(this));
    }

    // ------------------------------------------------------------------------
    // Public methods
    // ------------------------------------------------------------------------

    public async getPosition(): Promise<Position> {
        while (this._agentPosition === undefined) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        return this._agentPosition;
    }

    public async getID(): Promise<AgentID> {
        while (this._agentID === undefined) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        return this._agentID;
    }

    public async getCrossableTiles(): Promise<Tile[]> {
        while (this._crossableTiles === undefined) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        return this._crossableTiles;
    }

    public async getEnvironmentConfig(): Promise<EnvironmentConfig> {
        while (this._config === undefined) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        return this._config;
    }

    // ------------------------------------------------------------------------
    // Sensors methods
    // ------------------------------------------------------------------------

    public onPositionUpdate(callback: (position: Position) => void): void {
        this._socket.on("you", (agent) => {
            callback(new Position(agent.x, agent.y));
        });
    }

    public onParcelSensing(callback: (parcels: Parcel[]) => void): void {
        this._socket.on("parcels sensing", (parcels) => {
            const newParcels = [];
            for (const parcel of parcels) {
                newParcels.push(
                    new Parcel(
                        new ParcelID(parcel.id),
                        new DecayingValue(parcel.reward, Instant.now()),
                        new Position(parcel.x, parcel.y),
                        parcel.carriedBy ? new AgentID(parcel.carriedBy) : null,
                    ),
                );
            }

            if (newParcels.length > 0) {
                callback(newParcels);
            }
        });
    }

    public onAgentSensing(callback: (agents: VisibleAgent[]) => void): void {
        this._socket.on("agents sensing", (agents) => {
            const newAgents: VisibleAgent[] = [];
            for (const agent of agents) {
                newAgents.push(
                    new VisibleAgent(
                        new AgentID(agent.id),
                        new Position(agent.x, agent.y),
                        agent.score,
                    ),
                );
            }

            if (newAgents.length > 0) {
                callback(newAgents);
            }
        });
    }

    // ------------------------------------------------------------------------
    // Actuators methods
    // ------------------------------------------------------------------------

    public async move(direction: Direction): Promise<boolean> {
        if (direction === Direction.NONE) {
            // the server does not accept a direction of None
            return true;
        }

        return new Promise((resolve, _reject) => {
            this._socket.emit("move", direction, (response: boolean | PromiseLike<boolean>) => {
                resolve(response);
            });
        });
    }

    public async pickup(): Promise<HashSet<ParcelID>> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("pickup", (response: any[]) => {
                const parcels: HashSet<ParcelID> = new HashSet<ParcelID>();
                for (const parcel of response) {
                    parcels.add(new ParcelID(parcel.id));
                }

                resolve(parcels);
            });
        });
    }

    public async putdown(parcels: Parcel[] | null): Promise<HashSet<ParcelID>> {
        return new Promise((resolve, _reject) => {
            const ids = parcels !== null ? parcels.map((parcel) => parcel.id.serialize()) : null;
            this._socket.emit("putdown", ids, (response: any[]) => {
                const putDownParcels: HashSet<ParcelID> = new HashSet<ParcelID>();
                for (const parcel of response) {
                    putDownParcels.add(new ParcelID(parcel.id));
                }

                resolve(putDownParcels);
            });
        });
    }

    // ------------------------------------------------------------------------
    // Messenger methods
    // ------------------------------------------------------------------------

    public async shoutHelloMessage(message: HelloMessage): Promise<void> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("shout", serializeMessage(message), () => {
                resolve();
            });
        });
    }

    public async sendPositionUpdateMessage(
        id: AgentID,
        message: PositionUpdateMessage,
    ): Promise<void> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("say", id.serialize(), serializeMessage(message), () => {
                resolve();
            });
        });
    }

    public async sendParcelSensingMessage(
        id: AgentID,
        message: ParcelSensingMessage,
    ): Promise<void> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("say", id.serialize(), serializeMessage(message), () => {
                resolve();
            });
        });
    }

    public async sendAgentSensingMessage(id: AgentID, message: AgentSensingMessage): Promise<void> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("say", id.serialize(), serializeMessage(message), () => {
                resolve();
            });
        });
    }

    public async sendIntentionUpdateMessage(
        id: AgentID,
        message: IntentionUpdateMessage,
    ): Promise<void> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("say", id.serialize(), serializeMessage(message), () => {
                resolve();
            });
        });
    }

    public async sendIgnoreMeMessage(id: AgentID, message: IgnoreMeMessage): Promise<void> {
        return new Promise((resolve, _reject) => {
            this._socket.emit("say", id.serialize(), serializeMessage(message), () => {
                resolve();
            });
        });
    }

    public onHelloMessage(callback: (sender: AgentID, message: HelloMessage) => void): void {
        this._socket.on("msg", (id, _name, msg, reply) => {
            try {
                const message = deserializeMessage(msg);
                if (message.type === MessageType.HELLO) {
                    callback(new AgentID(id), message);
                    if (reply) {
                        reply();
                    }
                }
            } catch (error) {
                // If the error is an UnknownMessageError, we ignore it
                // since it means that we received a message from an agent
                // that does not follow the protocol.

                if (!(error instanceof UnknownMessageError)) {
                    // If this happens, there is a bug in the code.
                    throw error;
                }
            }
        });
    }

    public onPositionUpdateMessage(
        callback: (sender: AgentID, message: PositionUpdateMessage) => void,
    ): void {
        this._socket.on("msg", (id, _name, msg, reply) => {
            try {
                const message = deserializeMessage(msg);
                if (message.type === MessageType.POSITION_UPDATE) {
                    callback(new AgentID(id), message);
                    if (reply) {
                        reply();
                    }
                }
            } catch (error) {
                if (!(error instanceof UnknownMessageError)) {
                    throw error;
                }
            }
        });
    }

    public onParcelSensingMessage(
        callback: (sender: AgentID, message: ParcelSensingMessage) => void,
    ): void {
        this._socket.on("msg", (id, _name, msg, reply) => {
            try {
                const message = deserializeMessage(msg);
                if (message.type === MessageType.PARCEL_SENSING) {
                    callback(new AgentID(id), message);
                    if (reply) {
                        reply();
                    }
                }
            } catch (error) {
                if (!(error instanceof UnknownMessageError)) {
                    throw error;
                }
            }
        });
    }

    public onAgentSensingMessage(
        callback: (sender: AgentID, message: AgentSensingMessage) => void,
    ): void {
        this._socket.on("msg", (id, _name, msg, reply) => {
            try {
                const message = deserializeMessage(msg);
                if (message.type === MessageType.AGENT_SENSING) {
                    callback(new AgentID(id), message);
                    if (reply) {
                        reply();
                    }
                }
            } catch (error) {
                if (!(error instanceof UnknownMessageError)) {
                    throw error;
                }
            }
        });
    }

    public onIntentionUpdateMessage(
        callback: (sender: AgentID, message: IntentionUpdateMessage) => void,
    ): void {
        this._socket.on("msg", (id, _name, msg, reply) => {
            try {
                const message = deserializeMessage(msg);
                if (message.type === MessageType.INTENTION_UPDATE) {
                    callback(new AgentID(id), message);
                    if (reply) {
                        reply();
                    }
                }
            } catch (error) {
                if (!(error instanceof UnknownMessageError)) {
                    throw error;
                }
            }
        });
    }

    public onIgnoreMeMessage(callback: (sender: AgentID, message: IgnoreMeMessage) => void): void {
        this._socket.on("msg", (id, _name, msg, reply) => {
            try {
                const message = deserializeMessage(msg);
                if (message.type === MessageType.IGNORE) {
                    callback(new AgentID(id), message);
                    if (reply) {
                        reply();
                    }
                }
            } catch (error) {
                if (!(error instanceof UnknownMessageError)) {
                    throw error;
                }
            }
        });
    }

    // ------------------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------------------

    private _setAgentInfo(agent: any) {
        this._agentPosition = new Position(agent.x, agent.y);
        this._agentID = new AgentID(agent.id);
    }

    private _setCrossableTiles(_width: number, _height: number, tiles: any[]) {
        this._crossableTiles = tiles.map(
            (tile) => new Tile(new Position(tile.x, tile.y), tile.delivery, tile.parcelSpawner),
        );
    }

    private _setConfig(config: any) {
        let parcelGenerationInterval: Duration;
        switch (typeof config.PARCELS_GENERATION_INTERVAL) {
            case "string": {
                if (config.PARCELS_GENERATION_INTERVAL === "infinite") {
                    parcelGenerationInterval = Duration.fromMilliseconds(Number.POSITIVE_INFINITY);
                } else {
                    const interval = parseInt(config.PARCELS_GENERATION_INTERVAL.slice(0, -1), 10);
                    parcelGenerationInterval = Duration.fromMilliseconds(interval * 1000);
                }
                break;
            }
            case "number": {
                parcelGenerationInterval = Duration.fromMilliseconds(
                    config.PARCELS_GENERATION_INTERVAL,
                );
                break;
            }
            default: {
                throw new Error("Invalid PARCEL_GENERATION_INTERVAL.");
            }
        }

        let parcelRewardMean: number;
        switch (typeof config.PARCEL_REWARD_AVG) {
            case "string": {
                parcelRewardMean = parseInt(config.PARCEL_REWARD_AVG, 10);
                break;
            }
            case "number": {
                parcelRewardMean = config.PARCEL_REWARD_AVG;
                break;
            }
            default: {
                throw new Error("Invalid PARCEL_REWARD_AVG.");
            }
        }

        let parcelRewardVariance: number;
        switch (typeof config.PARCEL_REWARD_VARIANCE) {
            case "string": {
                parcelRewardVariance = parseInt(config.PARCEL_REWARD_VARIANCE, 10);
                break;
            }
            case "number": {
                parcelRewardVariance = config.PARCEL_REWARD_VARIANCE;
                break;
            }
            default: {
                throw new Error("Invalid PARCEL_REWARD_VARIANCE.");
            }
        }

        let parcelDecayingInterval: Duration;
        switch (typeof config.PARCEL_DECADING_INTERVAL) {
            case "string": {
                if (config.PARCEL_DECADING_INTERVAL === "infinite") {
                    parcelDecayingInterval = Duration.fromMilliseconds(Number.POSITIVE_INFINITY);
                } else {
                    const interval = parseInt(config.PARCEL_DECADING_INTERVAL.slice(0, -1), 10);
                    parcelDecayingInterval = Duration.fromMilliseconds(interval * 1000);
                }
                break;
            }
            case "number": {
                parcelDecayingInterval = Duration.fromMilliseconds(config.PARCEL_DECADING_INTERVAL);
                break;
            }
            default: {
                throw new Error("Invalid PARCEL_DECADING_INTERVAL.");
            }
        }

        let movementSteps: number;
        switch (typeof config.MOVEMENT_STEPS) {
            case "string": {
                movementSteps = parseInt(config.MOVEMENT_STEPS, 10);
                break;
            }
            case "number": {
                movementSteps = config.MOVEMENT_STEPS;
                break;
            }
            default: {
                throw new Error("Invalid MOVEMENT_STEPS.");
            }
        }

        let movementDuration: Duration;
        switch (typeof config.MOVEMENT_DURATION) {
            case "string": {
                const interval = parseInt(config.MOVEMENT_DURATION.slice(0, -1), 10);
                movementDuration = Duration.fromMilliseconds(interval);
                break;
            }
            case "number": {
                movementDuration = Duration.fromMilliseconds(config.MOVEMENT_DURATION);
                break;
            }
            default: {
                throw new Error("Invalid MOVEMENT_DURATION.");
            }
        }

        let parcelRadius: number;
        switch (typeof config.PARCELS_OBSERVATION_DISTANCE) {
            case "number": {
                parcelRadius = config.PARCELS_OBSERVATION_DISTANCE - 1;
                break;
            }
            default: {
                throw new Error("Invalid PARCEL_RADIUS.");
            }
        }

        let agentRadius: number;
        switch (typeof config.AGENTS_OBSERVATION_DISTANCE) {
            case "number": {
                agentRadius = config.AGENTS_OBSERVATION_DISTANCE - 1;
                break;
            }
            default: {
                throw new Error("Invalid AGENT_RADIUS.");
            }
        }

        let maxParcels: number;
        switch (typeof config.PARCELS_MAX) {
            case "string": {
                maxParcels = parseInt(config.PARCELS_MAX, 10);
                break;
            }
            case "number": {
                maxParcels = config.PARCELS_MAX;
                break;
            }
            default: {
                throw new Error("Invalid MAX_PARCELS.");
            }
        }

        let numRandomAgents: number;
        switch (typeof config.RANDOMLY_MOVING_AGENTS) {
            case "string": {
                numRandomAgents = parseInt(config.RANDOMLY_MOVING_AGENTS, 10);
                break;
            }
            case "number": {
                numRandomAgents = config.RANDOMLY_MOVING_AGENTS;
                break;
            }
            default: {
                throw new Error("Invalid NUM_RANDOM_AGENTS.");
            }
        }

        let randomAgentMovementDuration: Duration;
        switch (typeof config.RANDOM_AGENT_SPEED) {
            case "string": {
                const interval = parseInt(config.RANDOM_AGENT_SPEED.slice(0, -1), 10);
                randomAgentMovementDuration = Duration.fromMilliseconds(interval * 1000);
                break;
            }
            case "number": {
                randomAgentMovementDuration = Duration.fromMilliseconds(config.RANDOM_AGENT_SPEED);
                break;
            }
            default: {
                throw new Error("Invalid RANDOM_AGENT_SPEED.");
            }
        }

        this._config = {
            parcelGenerationInterval,
            parcelRewardMean,
            parcelRewardVariance,
            parcelDecayingInterval,
            movementSteps,
            movementDuration,
            parcelRadius,
            agentRadius,
            maxParcels,
            numRandomAgents,
            randomAgentMovementDuration,
        };
    }
}
