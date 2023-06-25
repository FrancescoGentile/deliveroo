//
//
//

import { Hashable } from 'src/utils';
import { GridSize } from './grid';
import { Direction } from './direction';

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

export class Position implements Hashable {
  public constructor(
    public readonly row: number,
    public readonly column: number
  ) {}

  public static fromIndex(index: number, size: GridSize): Position {
    const row = Math.floor(index / size.columns);
    const column = index % size.columns;
    return new Position(row, column);
  }

  public toIndex(size: GridSize): number {
    return this.row * size.columns + this.column;
  }

  public moveTo(direction: Direction): Position {
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

  public neigbours(size: GridSize): Position[] {
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

  public isValid(size: GridSize): boolean {
    return (
      this.row >= 0 &&
      this.row < size.rows &&
      this.column >= 0 &&
      this.column < size.columns
    );
  }

  public equals(other: Position): boolean {
    return this.row === other.row && this.column === other.column;
  }

  public hash(): string {
    return `${this.row},${this.column}`;
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

export class Tile {
  public constructor(
    public readonly position: Position,
    public readonly delivery: boolean,
    public readonly crossable: boolean,
    public readonly spawn: boolean
  ) {}

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
