//
//
//

import {
  Agent,
  Config,
  GridSize,
  Parcel,
  Position,
  Tile,
} from 'src/domain/structs';
import { HashSet } from 'src/utils';

export interface Sensors {
  /**
   * Gets the agent's current position
   * @returns The agent's current position.
   */
  getPosition(): Promise<Position>;

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
  onParcelSensing(callback: (parcels: HashSet<Parcel>) => void): void;

  /**
   * Gets the position of the agent when it is updated.
   * @param callback The callback to call when the position is updated.
   */
  onPositionUpdate(callback: (position: Position) => void): void;

  /**
   * Gets the agents that are currently being sensed.
   * @param callback The callback to call when agents are sensed.
   */
  onAgentSensing(callback: (agents: Agent[]) => void): void;
}
