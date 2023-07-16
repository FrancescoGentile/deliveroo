//
//
//

import { Hashable } from 'src/utils';
import { Config } from './config';
import type { AgentID } from './agent';
import { Position } from './location';

// ---------------------------------------------------------------------------
// ParcelID
// ---------------------------------------------------------------------------

export class ParcelID implements Hashable {
  private readonly _id: string;

  public constructor(id: string) {
    this._id = id;
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
  private readonly _value: number;

  private readonly _time: number;

  public constructor(value: number, time: number = Date.now()) {
    this._value = value;
    this._time = time;
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
    const refValue = this.getValueByInstant(reference);
    if (refValue <= 0) {
      return 0;
    }

    const delatValue = new DecayingValue(refValue, reference).getValueByInstant(
      reference + delta
    );

    return refValue - delatValue;
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Parcel
// ---------------------------------------------------------------------------

export class Parcel implements Hashable {
  public constructor(
    public readonly id: ParcelID,
    public readonly value: DecayingValue,
    public readonly position: Position,
    public readonly agentID: AgentID | null
  ) {}

  public equals(other: Parcel): boolean {
    return this.id.equals(other.id);
  }

  public hash(): string {
    return this.id.hash();
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
