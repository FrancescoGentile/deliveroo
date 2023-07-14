//
//
//

import { Hashable } from 'src/utils';
import { Position } from './location';
import { ParcelID } from './parcel';

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

export enum AgentType {
  RANDOM = 'random',
  SMART = 'smart',
}

export class Agent implements Hashable {
  public constructor(
    public readonly id: AgentID,
    public position: Position,
    public readonly carriedParcels: ParcelID[],
    public score: number,
    public type: AgentType,
    public lastSeen: number
  ) {}

  public equals(other: Agent): boolean {
    return this.id.equals(other.id);
  }

  public hash(): string {
    return this.id.hash();
  }

  public toString(): string {
    return JSON.stringify(this, null, 2);
  }
}
