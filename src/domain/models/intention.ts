//
//
//

import { ParcelID } from './parcel';
import { Tile } from './location';

export type Intention = PutDownIntention | MoveIntention | PickUpIntention;

// ---------------------------------------------------------------------------
// PutDownIntention
// ---------------------------------------------------------------------------

export class PutDownIntention {
  public readonly tile: Tile;

  public readonly parcels: ParcelID[] | null;

  private constructor(tile: Tile, parcels: ParcelID[] | null = null) {
    this.tile = tile;
    this.parcels = parcels;
  }

  public static new(
    tile: Tile,
    parcels: ParcelID[] | null = null
  ): PutDownIntention {
    return new PutDownIntention(tile, parcels);
  }

  public equals(other: Intention): boolean {
    if (!(other instanceof PutDownIntention)) {
      return false;
    }

    return this.tile.equals(other.tile);
  }
}

// ---------------------------------------------------------------------------
// MoveIntention
// ---------------------------------------------------------------------------

export class MoveIntention {
  public readonly tile: Tile;

  private constructor(tile: Tile) {
    this.tile = tile;
  }

  public static new(tile: Tile): MoveIntention {
    return new MoveIntention(tile);
  }

  public equals(other: Intention): boolean {
    if (!(other instanceof MoveIntention)) {
      return false;
    }

    return this.tile.equals(other.tile);
  }
}

// ---------------------------------------------------------------------------
// PickUpIntention
// ---------------------------------------------------------------------------

export class PickUpIntention {
  public readonly tile: Tile;

  public readonly parcels: ParcelID[];

  private constructor(tile: Tile, parcels: ParcelID[]) {
    this.tile = tile;
    this.parcels = parcels;
  }

  public static new(tile: Tile, parcels: ParcelID[]): PickUpIntention {
    return new PickUpIntention(tile, parcels);
  }

  public equals(other: PickUpIntention): boolean {
    if (!(other instanceof PickUpIntention)) {
      return false;
    }

    return this.tile.equals(other.tile);
  }
}
