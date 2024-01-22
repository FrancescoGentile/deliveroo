//
//
//

import { HashMap, Instant } from "src/utils";
import { Parcel, ParcelID } from "./parcel";
import { DecayingValue } from "./value";

/**
 * A utility.
 *
 * This represents the potential value of a set of parcels at a given instance of time.
 */
export class Utility {
    public value: number;

    public parcels: HashMap<ParcelID, [DecayingValue, number]>;

    public time: Instant;

    public constructor(
        value: number,
        parcels: [ParcelID, DecayingValue][] | HashMap<ParcelID, [DecayingValue, number]>,
        time: Instant,
    ) {
        this.value = value;
        if (parcels instanceof HashMap) {
            this.parcels = parcels;
        } else {
            this.parcels = new HashMap();
            for (const [id, value] of parcels) {
                this.parcels.set(id, [value, 1]);
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

        for (const [id, [value, count]] of this.parcels.entries()) {
            const discount = discounts?.get(id) ?? 1;
            const diff = value.getValueDiff(this.time, instant) * discount;
            valueDiff += Math.min(diff, value.getMaxValue()) * count;
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
     * @returns The new utility
     */
    public newWith(reward: number, parcels: [ParcelID, DecayingValue][], time: Instant): Utility {
        const newValue = this.value + reward;
        const newParcels = this.parcels.copy();

        for (const [id, value] of parcels) {
            if (this.parcels.has(id)) {
                const [oldValue, count] = this.parcels.get(id)!;
                newParcels.set(id, [oldValue, count + 1]);
            } else {
                newParcels.set(id, [value, 1]);
            }
        }

        return new Utility(newValue, newParcels, time);
    }

    /**
     * Adds in place the given utility to this one:
     * - adds the value
     * - adds the parcels
     *
     * @param other The utility to add (this utility is not modified)
     */
    public add(other: Utility) {
        this.value += other.value;
        for (const [parcelID, [parcel, count]] of other.parcels.entries()) {
            if (this.parcels.has(parcelID)) {
                const [oldParcel, oldCount] = this.parcels.get(parcelID)!;
                this.parcels.set(parcelID, [oldParcel, oldCount + count]);
            } else {
                this.parcels.set(parcelID, [parcel, count]);
            }
        }
    }
}
