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
    public readonly value: number;

    public readonly parcels: HashMap<ParcelID, DecayingValue>;

    public readonly time: Instant;

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
        if (instant.milliseconds < this.time.milliseconds) {
            throw new Error("Cannot comute an utility in the past");
        }

        let valueDiff = 0;

        for (const [id, value] of this.parcels.entries()) {
            const discount = discounts?.get(id) ?? 1;
            const diff = value.getValueDiff(this.time, instant) * discount;
            valueDiff += Math.min(diff, value.getMaxValue());
        }

        const value = this.value - valueDiff;
        return value < 0 ? 0 : value;
    }
}
