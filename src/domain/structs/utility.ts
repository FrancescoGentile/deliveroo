//
//
//

import { HashMap } from 'src/utils';
import { Parcel, ParcelID } from './parcel';

export class Utility {
  private _value: number;

  private _parcels: HashMap<ParcelID, [Parcel, number]>;

  private _time: number;

  public constructor(
    value: number,
    parcels: Parcel[] | HashMap<ParcelID, [Parcel, number]>,
    time: number
  ) {
    this._value = value;
    if (parcels instanceof HashMap) {
      this._parcels = parcels;
    } else {
      this._parcels = new HashMap();
      for (const parcel of parcels) {
        this._parcels.set(parcel.id, [parcel, 1]);
      }
    }
    this._time = time;
  }

  /**
   * Computes the value at the given instance of time .
   * @param instant The instance to compute the value at (in milliseconds). Defaults to the current time.
   * @returns The value.
   */
  public getValueByInstant(instant: number = Date.now()): number {
    const tempDiff = instant - this._time;
    let valueDiff = 0;

    for (const [parcel, count] of this._parcels.values()) {
      valueDiff += parcel.value.getValueDiff(this._time, tempDiff) * count;
    }

    const value = this._value - valueDiff;
    return value < 0 ? 0 : value;
  }

  public newWith(reward: number, parcels: Parcel[], time: number): Utility {
    const newValue = this._value + reward;
    const newParcels = this._parcels.copy();
    for (const parcel of parcels) {
      if (this._parcels.has(parcel.id)) {
        const [oldParcel, count] = this._parcels.get(parcel.id)!;
        newParcels.set(parcel.id, [oldParcel, count + 1]);
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