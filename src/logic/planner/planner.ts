//
//
//

import EventEmitter from 'eventemitter3';
import { AgentID, Intention } from '../structs';
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

  public stop() {
    this._root = null;
    clearImmediate(this._nextIteration);
    this._nextIteration = undefined;
  }

  public onPlansChanged(callback: (plans: [AgentID, Intention[]][]) => void): void {
    this._emitter.on('plansChanged', callback);
  }
}
