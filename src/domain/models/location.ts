//
//
//

import { GridSize } from './grid';
import { Direction } from './direction';

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export interface Location {
  readonly row: number;

  readonly column: number;

  toIndex(size: GridSize): number;

  moveTo(direction: Direction): Location;

  neigbours(size: GridSize): Location[];
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

export class Position implements Location {
  public readonly row: number;

  public readonly column: number;

  private constructor(row: number, column: number) {
    this.row = row;
    this.column = column;
  }

  public static new(row: number, column: number): Position {
    return new Position(row, column);
  }

  public static fromIndex(index: number, size: GridSize): Position {
    const row = Math.floor(index / size.columns);
    const column = index % size.columns;
    return new Position(row, column);
  }

  public toIndex(size: GridSize): number {
    return this.row * size.columns + this.column;
  }

  public moveTo(direction: Direction): Location {
    switch (direction) {
      case Direction.UP:
        return new Position(this.row, this.column + 1);
      case Direction.DOWN:
        return new Position(this.row, this.column - 1);
      case Direction.LEFT:
        return new Position(this.row - 1, this.column);
      case Direction.RIGHT:
        return new Position(this.row + 1, this.column);
      default:
        // this should never happen
        throw new Error(`Unknown direction: ${direction}`);
    }
  }

  public neigbours(size: GridSize): Location[] {
    const positions: Position[] = [];

    if (this.row > 0) {
      positions.push(new Position(this.row - 1, this.column));
    }
    if (this.row < size.rows - 1) {
      positions.push(new Position(this.row + 1, this.column));
    }
    if (this.column > 0) {
      positions.push(new Position(this.row, this.column - 1));
    }
    if (this.column < size.columns - 1) {
      positions.push(new Position(this.row, this.column + 1));
    }

    return positions;
  }

  public equals(other: Position): boolean {
    return this.row === other.row && this.column === other.column;
  }
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

export class Tile implements Location {
  public readonly position: Position;

  public readonly delivery: boolean;

  public readonly crossable: boolean;

  private constructor(
    position: Position,
    delivery: boolean,
    crossable: boolean
  ) {
    this.position = position;
    this.delivery = delivery;
    this.crossable = crossable;
  }

  public static new(
    position: Position,
    delivery: boolean,
    crossable: boolean
  ): Tile {
    return new Tile(position, delivery, crossable);
  }

  public get row(): number {
    return this.position.row;
  }

  public get column(): number {
    return this.position.column;
  }

  public toIndex(size: GridSize): number {
    return this.position.toIndex(size);
  }

  public moveTo(direction: Direction): Location {
    return this.position.moveTo(direction);
  }

  public neigbours(size: GridSize): Location[] {
    return this.position.neigbours(size);
  }

  public equals(other: Tile): boolean {
    return this.position.equals(other.position);
  }
}
