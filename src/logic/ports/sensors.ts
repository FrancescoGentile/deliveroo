//
//
//

import {
    Agent,
    AgentID,
    GameConfig,
    Parcel,
    Position,
    Tile,
} from "src/logic/structs";

export interface Sensors {
    /**
     * Gets the agent's current position.
     * @returns The agent's current position.
     */
    getPosition(): Promise<Position>;

    /**
     * Gets the agent's id.
     * @returns The agent's id.
     */
    getID(): Promise<AgentID>;

    /**
     * Gets the tiles that are crossable.
     * @returns The crossable tiles.
     */
    getCrossableTiles(): Promise<Tile[]>;

    /**
     * Gets the configuration of the environment.
     * @returns The configuration.
     */
    getConfig(): Promise<GameConfig>;

    /**
     * Event that is triggered when at least one parcel is sensed.
     * @param callback The callback to call when parcels are sensed.
     */
    onParcelSensing(callback: (parcels: Parcel[]) => void): void;

    /**
     * Event that is triggered when the agent's position is updated.
     * @param callback The callback to call when the position is updated.
     */
    onPositionUpdate(callback: (position: Position) => void): void;

    /**
     * Event that is triggered when at least one agent is sensed.
     * @param callback The callback to call when agents are sensed.
     */
    onAgentSensing(callback: (agents: Agent[]) => void): void;
}
