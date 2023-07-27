//
//
//

import { Hashable, Instant } from 'src/utils';
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

  private readonly _time: Instant;

  public constructor(value: number, time: Instant = Instant.now()) {
    this._value = value;
    this._time = time;
  }

  /**
   * Compute the value at the given instance of time .
   * @param instant The instance to compute the value at (in milliseconds). Defaults to the current time.
   * @returns The value.
   */
  public getValueByInstant(instant: Instant = Instant.now()): number {
    const diff = instant.subtract(this._time);
    const decay = Config.getInstance().parcelDecayingInterval;
    const value = this._value - diff.milliseconds / decay;
    return value < 0 ? 0 : value;
  }

  public getValueDiff(start: Instant, end: Instant): number {
    const first = this.getValueByInstant(start);
    const second = this.getValueByInstant(end);

    return first - second;
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
