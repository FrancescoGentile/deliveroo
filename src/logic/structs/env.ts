//
//
//

import { Hashable } from 'src/utils';

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

export enum Direction {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
  NONE = 'none',
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

export class Position implements Hashable {
  public constructor(public readonly row: number, public readonly column: number) {}

  /**
   * Computes the manhattan distance between this position and the other position.
   * @param other The other position.
   * @returns The manhattan distance between this position and the other position.
   */
  public manhattanDistance(other: Position): number {
    return Math.abs(this.row - other.row) + Math.abs(this.column - other.column);
  }

  /**
   * Returns the position that is one step in the given direction.
   * This method assumes that the resulting position exists.
   * @param direction The direction to move to.
   * @returns The position that is one step in the given direction.
   */
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
      case Direction.NONE:
        return new Position(this.row, this.column);
      default:
        // this should never happen
        throw new Error(`Unknown direction: ${direction}`);
    }
  }

  public interpolate(other: Position, t: number): Position {
    const row = this.row + t * (other.row - this.row);
    const column = this.column + t * (other.column - this.column);
    return new Position(row, column);
  }

  /**
   * Returns the positions that are adjacent to this position.
   * Note that this method does not check whether the resulting positions exist.
   * @returns The positions that are adjacent to this position.
   */
  public adjacent(): Position[] {
    return [
      this.moveTo(Direction.UP),
      this.moveTo(Direction.DOWN),
      this.moveTo(Direction.LEFT),
      this.moveTo(Direction.RIGHT),
    ];
  }

  /**
   * Returns the direction to take to get to the other adjacent position.
   * This method assumes that the other position is adjacent to this position or that is the same as this position.
   * If this is not the case, the result should not be trusted.
   * @param other The adjacent position.
   * @returns The direction to take to get to the other position.
   */
  public directionTo(other: Position): Direction {
    let direction;

    if (other.row === this.row) {
      if (other.column > this.column) {
        direction = Direction.UP;
      } else if (other.column < this.column) {
        direction = Direction.DOWN;
      } else {
        direction = Direction.NONE;
      }
    } else if (other.row > this.row) {
      direction = Direction.RIGHT;
    } else {
      direction = Direction.LEFT;
    }

    return direction;
  }

  public equals(other: Position): boolean {
    return this.row === other.row && this.column === other.column;
  }

  public hash(): string {
    return `${this.row},${this.column}`;
  }

  public toString(): string {
    return `Position(${this.row}, ${this.column})`;
  }

  public serialize(): string {
    return `${this.row},${this.column}`;
  }

  public static deserialize(serialized: string): Position {
    const [row, column] = serialized.split(',').map((value) => parseInt(value, 10));
    return new Position(row, column);
  }
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

export class Tile {
  public constructor(
    public readonly position: Position,
    public readonly delivery: boolean,
    public readonly spawn: boolean
  ) {}
}
