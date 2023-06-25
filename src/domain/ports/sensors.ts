//
//
//

import {
  AgentID,
  Agent,
  Config,
  GridSize,
  Parcel,
  Position,
  Tile,
} from 'src/domain/structs';

export interface Sensors {
  /**
   * Gets the agent's current state.
   * @returns The agent's current state.
   */
  getState(): Promise<Agent>;

  /**
   * Gets the tiles that are crossable.
   * @returns The crossable tiles.
   */
  getCrossableTiles(): Promise<Tile[]>;

  /**
   * Gets the size of the grid.
   * @returns The size of the grid.
   */
  getGridSize(): Promise<GridSize>;

  /**
   * Gets the configuration of the environment.
   * @returns The configuration.
   */
  getConfig(): Promise<Config>;

  /**
   * Gets the parcels that are currently being sensed.
   * @param callback The callback to call when parcels are sensed.
   */
  onParcelSensing(
    callback: (parcels: [Parcel, Position, AgentID | null][]) => void
  ): void;
}
