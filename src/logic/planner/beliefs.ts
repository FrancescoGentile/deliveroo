//
//
//

import { HashMap } from 'src/utils';
import { Agent, Parcel, ParcelID, Position } from '../structs';

export class BeliefSet {
  private readonly _freeParcels: HashMap<ParcelID, Parcel>;

  private readonly _positionToParcels: HashMap<Position, ParcelID[]>;

  public constructor() {
    this._freeParcels = new HashMap();
    this._positionToParcels = new HashMap();
  }

  public get freeParcels(): Parcel[] {
    return [...this._freeParcels.values()];
  }

  // eslint-disable-next-line class-methods-use-this
  public get visibleAgents(): Agent[] {
    return [];
  }

  /**
   * Returns the positions where there is at least one free parcel.
   */
  public getParcelsPositions(): Position[] {
    return [...this._positionToParcels.keys()];
  }

  public getParcelsByPosition(position: Position): Parcel[] {
    return this._positionToParcels.get(position)?.map((id) => this._freeParcels.get(id)!) ?? [];
  }

  public updateState(parcels: Parcel[], _visibleAgents: Agent[]): boolean {
    let isChanged = false;

    for (const parcel of parcels) {
      const oldParcel = this._freeParcels.get(parcel.id);
      if (oldParcel === undefined) {
        this._freeParcels.set(parcel.id, parcel);
        isChanged = true;
      } else if (!oldParcel.position.equals(parcel.position)) {
        this._changeParcelPosition(parcel.id, parcel.position);
        isChanged = true;
      } else if (parcel.agentID !== null) {
        this._removeParcel(parcel.id);
        isChanged = true;
      }
    }

    return isChanged;
  }

  public updateParcels(
    newFreeParcels: Parcel[],
    changedPositionParcels: [ParcelID, Position][],
    noLongerFreeParcels: ParcelID[]
  ): boolean {
    let isChanged = false;

    for (const parcel of newFreeParcels) {
      if (!this._freeParcels.has(parcel.id)) {
        this._freeParcels.set(parcel.id, parcel);
        isChanged = true;
      }
    }

    for (const [parcelID, position] of changedPositionParcels) {
      const oldPosition = this._freeParcels.get(parcelID)?.position;
      if (oldPosition === undefined || position.equals(oldPosition)) {
        continue;
      }

      this._changeParcelPosition(parcelID, position);
      isChanged = true;
    }

    for (const parcelID of noLongerFreeParcels) {
      if (this._freeParcels.has(parcelID)) {
        this._removeParcel(parcelID);
        isChanged = true;
      }
    }

    return isChanged;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private _removeParcel(parcelID: ParcelID): void {
    const parcel = this._freeParcels.get(parcelID);
    if (parcel === undefined) {
      return;
    }

    const parcels = this._positionToParcels.get(parcel.position)!;
    const parcelIndex = parcels.findIndex((id) => id.equals(parcelID));
    parcels.splice(parcelIndex, 1);

    if (parcels.length === 0) {
      this._positionToParcels.delete(parcel.position);
    }

    this._freeParcels.delete(parcelID);
  }

  private _changeParcelPosition(parcelID: ParcelID, newPosition: Position): void {
    const oldPosition = this._freeParcels.get(parcelID)!.position;
    this._freeParcels.get(parcelID)!.position = newPosition;

    const oldPositionParcels = this._positionToParcels.get(oldPosition)!;
    const parcelIndex = oldPositionParcels.findIndex((id) => id.equals(parcelID));
    oldPositionParcels.splice(parcelIndex, 1);

    if (oldPositionParcels.length === 0) {
      this._positionToParcels.delete(oldPosition);
    }

    let newPositionParcels = this._positionToParcels.get(newPosition);
    if (newPositionParcels === undefined) {
      newPositionParcels = [];
    }
    newPositionParcels.push(parcelID);
    this._positionToParcels.set(newPosition, newPositionParcels);
  }
}
