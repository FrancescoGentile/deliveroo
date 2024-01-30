//
//
//

import { HashMap, Instant } from "src/utils";
import { ParcelID } from "./parcel";
import { DecayingValue } from "./value";

/**
 * A utility.
 *
 * This represents the potential value of a set of parcels at a given instance of time.
 */
export class Utility {
    public value: number;

    public parcels: HashMap<ParcelID, DecayingValue>;

    public time: Instant;

    public constructor(
        value: number,
        parcels: [ParcelID, DecayingValue][] | HashMap<ParcelID, DecayingValue>,
        time: Instant,
    ) {
        this.value = value;
        if (parcels instanceof HashMap) {
            this.parcels = parcels;
        } else {
            this.parcels = new HashMap();
            for (const [id, value] of parcels) {
                this.parcels.set(id, value);
            }
        }
        this.time = time;
    }

    public static zero(instant: Instant): Utility {
        return new Utility(0, new HashMap(), instant);
    }

    /**
     * Computes the value at the given instance of time .
     *
     * @param instant The instance to compute the value at. Defaults to the current time.
     * @returns The value.
     */
    public getValueByInstant(instant: Instant, discounts?: HashMap<ParcelID, number>): number {
        let valueDiff = 0;

        for (const [id, value] of this.parcels.entries()) {
            const discount = discounts?.get(id) ?? 1;
            valueDiff += value.getValueDiff(this.time, instant) * discount;
        }

        const value = this.value - valueDiff;
        return value < 0 ? 0 : value;
    }

    /**
     * Returns a new utility:
     * - with the given reward added to the value
     * - with the given parcels added to the parcels
     * - with the given time
     *
     * @param reward The reward to add to the utility's value
     * @param parcels The parcels to add to the utility's parcels
     * @param time The time to set
     *
     * @returns The new utility
     */
    public newWith(reward: number, parcels: [ParcelID, DecayingValue][], time: Instant): Utility {
        const newValue = this.value + reward;
        const newParcels = this.parcels.copy();

        for (const [id, value] of parcels) {
            newParcels.set(id, value);
        }

        return new Utility(newValue, newParcels, time);
    }
}
