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
    private _value: number;

    private _parcels: HashMap<ParcelID, [DecayingValue, number]>;

    private _time: Instant;

    public constructor(
        value: number,
        parcels: [ParcelID, DecayingValue][] | HashMap<ParcelID, [DecayingValue, number]>,
        time: Instant,
    ) {
        this._value = value;
        if (parcels instanceof HashMap) {
            this._parcels = parcels;
        } else {
            this._parcels = new HashMap();
            for (const [id, value] of parcels) {
                this._parcels.set(id, [value, 1]);
            }
        }
        this._time = time;
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
    public getValueByInstant(instant: Instant = Instant.now()): number {
        let valueDiff = 0;

        for (const [value, count] of this._parcels.values()) {
            valueDiff += value.getValueDiff(this._time, instant) * count;
        }

        const value = this._value - valueDiff;
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
        const newValue = this._value + reward;
        const newParcels = this._parcels.copy();

        for (const [id, value] of parcels) {
            if (this._parcels.has(id)) {
                const [oldValue, count] = this._parcels.get(id)!;
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
        this._value += other._value;
        for (const [parcelID, [parcel, count]] of other._parcels.entries()) {
            if (this._parcels.has(parcelID)) {
                const [oldParcel, oldCount] = this._parcels.get(parcelID)!;
                this._parcels.set(parcelID, [oldParcel, oldCount + count]);
            } else {
                this._parcels.set(parcelID, [parcel, count]);
            }
        }
    }
}
