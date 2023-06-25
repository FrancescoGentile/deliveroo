//
//
//

import { Parcel } from './parcel';
import { Position } from './location';

export type Intention = PutDownIntention | MoveIntention | PickUpIntention;

// ---------------------------------------------------------------------------
// PutDownIntention
// ---------------------------------------------------------------------------

export class PutDownIntention {
  public constructor(
    public readonly position: Position,
    public readonly parcels: Parcel[] | null
  ) {}

  public equals(other: Intention): boolean {
    if (!(other instanceof PutDownIntention)) {
      return false;
    }

    return this.position.equals(other.position);
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

// ---------------------------------------------------------------------------
// MoveIntention
// ---------------------------------------------------------------------------

export class MoveIntention {
  public constructor(public readonly position: Position) {}

  public equals(other: Intention): boolean {
    if (!(other instanceof MoveIntention)) {
      return false;
    }

    return this.position.equals(other.position);
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

// ---------------------------------------------------------------------------
// PickUpIntention
// ---------------------------------------------------------------------------

export class PickUpIntention {
  public constructor(
    public readonly position: Position,
    public readonly parcels: Parcel[]
  ) {}

  public equals(other: Intention): boolean {
    if (!(other instanceof PickUpIntention)) {
      return false;
    }

    return this.position.equals(other.position);
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
