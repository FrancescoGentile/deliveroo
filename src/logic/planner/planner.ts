//
//
//

import EventEmitter from 'eventemitter3';
import { Agent, AgentID, AgentState, Parcel } from '../structs';
import { BeliefSet } from './beliefs';
import { Node } from './node';

export class Planner {
  private readonly _beliefs: BeliefSet;

  private readonly _emitter: EventEmitter;

  private _root: Node | null = null;

  private _nextIteration?: NodeJS.Immediate;

  public constructor() {
    this._beliefs = new BeliefSet();
    this._emitter = new EventEmitter();
  }

  public get freeParcels(): Parcel[] {
    return this._beliefs.freeParcels;
  }

  public get visibleAgents(): Agent[] {
    return this._beliefs.visibleAgents;
  }

  public get agentsStates(): [AgentID, AgentState][] {
    if (this._root === null) {
      throw new Error('The planner is not running.');
    }

    return [...this._root.agentsStates.entries()];
  }

  // eslint-disable-next-line class-methods-use-this
  public mergeTeam(
    _newMembers: [AgentID, AgentState][],
    _parcels: Parcel[],
    _visibleAgents: Agent[]
  ): void {
    throw new Error('Not implemented');
  }

  public stop() {
    this._root = null;
    clearImmediate(this._nextIteration);
    this._nextIteration = undefined;
  }
}
