//
//
//

import { HashMap } from 'src/utils';
import {
  Direction,
  EnviromentChange,
  Location,
  Parcel,
  ParcelID,
  Tile,
} from 'src/domain/models';

/**
 * Interface for the environment.
 */
export interface Environment {
  /**
   * Returns the changes in the environment.
   * @returns the changes in the environment or null if there are no changes.
   */
  getChanges(): EnviromentChange | null;

  /**
   * Returns the parcels in the environment.
   * @returns the parcels in the environment.
   */
  getParcels(): HashMap<ParcelID, Parcel>;

  /**
   * Returns the location of the parcel.
   * @param parcelID the parcel ID.
   * @returns the location of the parcel.
   */
  getParcelLocation(parcelID: ParcelID): Location;

  /**
   * Returns the tile at the given location.
   * @param location the location.
   * @returns the tile at the given location.
   */
  getTilebyLocation(location: Location): Tile;

  /**
   * Returns the distance between two locations.
   * @param start the starting location.
   * @param end the ending location.
   * @returns the distance between the two locations.
   */
  distance(start: Location, end: Location): number;

  /**
   * Returns the direction to go from the starting location to reach the ending location.
   * @param start the starting location.
   * @param end the ending location.
   * @returns the direction to go from the starting location to reach the ending location,
   * or null if the two locations are the same.
   */
  nextDirection(start: Location, end: Location): Direction | null;

  /**
   * Returns the distance to the closest delivery location from the given location.
   * @param location the starting location.
   * @returns the distance to the closest delivery location.
   */
  closestDeliveryDistance(location: Location): number;

  /**
   * Returns the closest delivery location from the given location.
   * @param location the starting location.
   * @returns the closest delivery location.
   */
  getClosestDeliveryLocation(location: Location): Location;
}
