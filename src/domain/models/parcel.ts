//
//
//

import { Hashable } from 'src/utils';
import { Config } from './config';

// ---------------------------------------------------------------------------
// ParcelID
// ---------------------------------------------------------------------------

export class ParcelID implements Hashable {
  private constructor(private readonly _id: string) {}

  public static new(id: string): ParcelID {
    return new ParcelID(id);
  }

  public equals(other: ParcelID): boolean {
    return this._id === other._id;
  }

  public hash(): string {
    return this._id;
  }

  public toString(): string {
    return this._id;
  }
}

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

export class DecayingValue {
  private constructor(
    private readonly _value: number,
    private readonly _time: number
  ) {}

  public static new(value: number): DecayingValue {
    return new DecayingValue(value, Date.now());
  }

  /**
   * Compute the value at the given instance of time .
   * @param instant The instance to compute the value at (in milliseconds). Defaults to the current time.
   * @returns The value.
   */
  public getValueByInstant(instant: number = Date.now()): number {
    const diff = instant - this._time;
    const decay = Config.getInstance().parcelDecayingInterval;
    const value = this._value - diff / decay;
    return value < 0 ? 0 : value;
  }

  /**
   * Compute the difference between the value at the given instance of time and the value at the given instance of time plus the given delta.
   * @param reference The instance to compute the value at (in milliseconds).
   * @param delta The delta to add to the reference (in milliseconds).
   * @returns The difference.
   */
  public getValueDiff(reference: number, delta: number): number {
    const ref_value = this.getValueByInstant(reference);
    if (ref_value <= 0) {
      return 0;
    }

    const delta_value = new DecayingValue(
      ref_value,
      reference
    ).getValueByInstant(reference + delta);

    return ref_value - delta_value;
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Parcel
// ---------------------------------------------------------------------------

export class Parcel {
  private constructor(
    public readonly _id: ParcelID,
    public readonly _value: DecayingValue
  ) {}

  public static new(id: string, value: number): Parcel {
    return new Parcel(ParcelID.new(id), DecayingValue.new(value));
  }

  public equals(other: Parcel): boolean {
    return this._id.equals(other._id);
  }

  public hash(): string {
    return this._id.hash();
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
