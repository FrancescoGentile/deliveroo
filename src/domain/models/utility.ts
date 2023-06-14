//
//
//

import { HashMap } from 'src/utils';
import { Parcel, ParcelID } from './parcel';

export class Utility {
  private constructor(
    private readonly value: number,
    private readonly parcels: HashMap<ParcelID, [Parcel, number]>,
    private readonly time: number
  ) {}

  public static new(value: number, parcels: Parcel[], time: number): Utility {
    const parcelMap: HashMap<ParcelID, [Parcel, number]> = HashMap.new();
    for (const parcel of parcels) {
      parcelMap.set(parcel.id, [parcel, 1]);
    }

    return new Utility(value, parcelMap, time);
  }

  /**
   * Compute the value at the given instance of time .
   * @param instant The instance to compute the value at (in milliseconds). Defaults to the current time.
   * @returns The value.
   */
  public getValueByInstant(instant: number = Date.now()): number {
    const tempDiff = instant - this.time;
    let valueDiff = 0;

    for (const [parcel, count] of this.parcels.values()) {
      valueDiff += parcel.value.getValueDiff(this.time, tempDiff) * count;
    }

    const value = this.value - valueDiff;
    return value < 0 ? 0 : value;
  }
}
