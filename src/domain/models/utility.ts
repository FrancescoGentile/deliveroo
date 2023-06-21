//
//
//

import { HashMap } from 'src/utils';
import { Parcel, ParcelID } from './parcel';

export class Utility {
  private constructor(
    private _value: number,
    private readonly _parcels: HashMap<ParcelID, [Parcel, number]>,
    private readonly _time: number
  ) {}

  public static new(reward: number, parcels: Parcel[], time: number): Utility {
    const parcelMap: HashMap<ParcelID, [Parcel, number]> = HashMap.new();
    for (const parcel of parcels) {
      parcelMap.set(parcel._id, [parcel, 1]);
    }

    return new Utility(reward, parcelMap, time);
  }

  /**
   * Compute the value at the given instance of time .
   * @param instant The instance to compute the value at (in milliseconds). Defaults to the current time.
   * @returns The value.
   */
  public getValueByInstant(instant: number = Date.now()): number {
    const tempDiff = instant - this._time;
    let valueDiff = 0;

    for (const [parcel, count] of this._parcels.values()) {
      valueDiff += parcel._value.getValueDiff(this._time, tempDiff) * count;
    }

    const value = this._value - valueDiff;
    return value < 0 ? 0 : value;
  }

  public newFrom(reward: number, parcels: Parcel[], time: number): Utility {
    const newValue = this._value + reward;
    const newParcels = this._parcels.copy();
    for (const parcel of parcels) {
      if (this._parcels.has(parcel._id)) {
        const [oldParcel, count] = this._parcels.get(parcel._id)!;
        newParcels.set(parcel._id, [oldParcel, count + 1]);
      }
    }

    return new Utility(newValue, newParcels, time);
  }

  public add(other: Utility) {
    if (other._time !== this._time) {
      throw new Error('Cannot add utilities with different times');
    }

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
