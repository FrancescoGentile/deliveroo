//
//
//

import { Position } from './location';

export enum IntentionType {
  PUTDOWN = 'putdown',
  MOVE = 'move',
  PICKUP = 'pickup',
}

export class Intention {
  public constructor(
    public readonly type: IntentionType,
    public readonly position: Position
  ) {}

  public static move(position: Position): Intention {
    return new Intention(IntentionType.MOVE, position);
  }

  public static pickup(position: Position): Intention {
    return new Intention(IntentionType.PICKUP, position);
  }

  public static putdown(position: Position): Intention {
    return new Intention(IntentionType.PUTDOWN, position);
  }

  public equals(other: Intention): boolean {
    return this.type === other.type && this.position.equals(other.position);
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
