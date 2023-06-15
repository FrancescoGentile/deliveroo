//
//
//

import { HashSet } from 'src/utils';
import {
  Direction,
  ParcelID,
  Config,
  GridSize,
  Tile,
  Parcel,
  Location,
} from 'src/domain/models';

export interface Server {
  config: Config;

  gridSize: GridSize;

  crossableTiles: Tile[];

  initialLocation: Location;

  /**
   * Moves the agent in the given direction.
   * @param direction direction where to move.
   * @returns true if the move was successful, false otherwise.
   */
  move(direction: Direction): Promise<boolean>;

  /**
   * Picks up parcels.
   * @returns ids of parcels that were picked up.
   */
  pickUp(): Promise<HashSet<ParcelID>>;

  /**
   * Puts down parcels.
   * @param parcels parcels to put down.
   * @returns ids of parcels that were put down.
   */
  putDown(parcels: Parcel[] | null): Promise<HashSet<ParcelID>>;

  /**
   * Returns the parcels that are currently sensed by the agent.
   * @param callback callback to be called when parcels are sensed.
   */
  onParcelsSensing(callback: (parcels: [Parcel, Location][]) => void): void;
}
