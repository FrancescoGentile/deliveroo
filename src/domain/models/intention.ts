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
  private constructor(
    public readonly position: Position,
    public readonly parcels: Parcel[] | null
  ) {}

  public static new(
    position: Position,
    parcels: Parcel[] | null = null
  ): PutDownIntention {
    return new PutDownIntention(position, parcels);
  }

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
  private constructor(public readonly position: Position) {}

  public static new(position: Position): MoveIntention {
    return new MoveIntention(position);
  }

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
  private constructor(
    public readonly position: Position,
    public readonly parcels: Parcel[]
  ) {}

  public static new(position: Position, parcels: Parcel[]): PickUpIntention {
    return new PickUpIntention(position, parcels);
  }

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
