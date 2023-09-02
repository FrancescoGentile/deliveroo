//
//
//

import { Hashable } from 'src/utils';
import { Position } from './env';

export enum IntentionType {
  PUTDOWN = 'putdown',
  MOVE = 'move',
  PICKUP = 'pickup',
}

export class Intention implements Hashable {
  public constructor(public readonly type: IntentionType, public readonly position: Position) {}

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

  public hash(): string {
    return `${this.type}-${this.position.hash()}`;
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }

  public serialize(): string {
    return JSON.stringify({
      type: this.type,
      position: this.position.serialize(),
    });
  }

  public static deserialize(serialized: string): Intention {
    const parsed = JSON.parse(serialized);
    return new Intention(parsed.type, Position.deserialize(parsed.position));
  }
}
