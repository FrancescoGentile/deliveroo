//
//
//

import { Direction, Parcel, ParcelID } from "src/domain/structs";
import { HashSet } from "src/utils";

export interface Actuators {
    /**
     * Moves the agent in the given direction.
     * @param direction The direction to move in.
     * @returns Whether the move was successful.
     */
    move(direction: Direction): Promise<boolean>;

    /**
     * Picks up the parcel at the agent's current location.
     * @returns The IDs of the parcels picked up.
     */
    pickup(): Promise<HashSet<ParcelID>>;

    /**
     * Puts down the given parcels at the agent's current location.
     * @param parcels The parcels to put down. If null, all parcels are put down.
     * @returns The IDs of the parcels put down.
     */
    putdown(parcels: Parcel[] | null): Promise<HashSet<ParcelID>>;
}
