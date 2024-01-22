//
//
//

import { Instant } from "src/utils";
import { Config } from "./config";

/**
 * A decaying value.
 *
 * This represents the value of a parcel that decays over time.
 */
export class DecayingValue {
    private readonly _value: number;

    private readonly _time: Instant;

    public constructor(value: number, time: Instant) {
        this._value = value;
        this._time = time;
    }

    /**
     * Compute the value at the given instance of time.
     *
     * @param instant The instance to compute the value at.
     * @returns The value.
     */
    public getValueByInstant(instant: Instant): number {
        const diff = instant.subtract(this._time);
        const { parcelDecayingInterval } = Config.getEnvironmentConfig();
        const value = this._value - diff.milliseconds / parcelDecayingInterval.milliseconds;
        return value < 0 ? 0 : value;
    }

    /**
     * Computes the difference between the value at the given instances of time (start - end).
     * If the value becomes 0 in time between the two instances, the difference will be simply
     * equal to the value at the first instance. Thus, the difference in value is always between
     * 0 and the value at the first instance (inclusive).
     *
     * @param start The first instance of time.
     * @param end The second instance of time.
     * @returns The difference in value.
     */
    public getValueDiff(start: Instant, end: Instant): number {
        const first = this.getValueByInstant(start);
        const second = this.getValueByInstant(end);

        return first - second;
    }

    public getMaxValue(): number {
        return this._value;
    }

    public toString(): string {
        const value = this.getValueByInstant(Instant.now());
        return `DecayingValue(${value})`;
    }

    public serialize(): string {
        const obj = {
            value: this._value,
            time: this._time.serialize(),
        };
        return JSON.stringify(obj);
    }

    public static deserialize(serialized: string): DecayingValue {
        const obj = JSON.parse(serialized);
        return new DecayingValue(obj.value, Instant.deserialize(obj.time));
    }
}
