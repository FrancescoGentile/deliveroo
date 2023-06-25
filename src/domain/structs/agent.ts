//
//
//

import { Hashable } from 'src/utils';
import { Position } from './location';

export class AgentID implements Hashable {
  private readonly _id: string;

  public constructor(id: string) {
    this._id = id;
  }

  public equals(other: AgentID): boolean {
    return this._id === other._id;
  }

  public hash(): string {
    return this._id;
  }

  public toString(): string {
    return this._id;
  }
}

export class Agent {
  public constructor(
    public readonly id: AgentID,
    public readonly position: Position
  ) {}

  public equals(other: Agent): boolean {
    return this.id.equals(other.id);
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
