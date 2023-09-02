//
//
//

import EventEmitter from 'eventemitter3';
import { Duration, HashMap, Instant } from 'src/utils';
import { Agent, AgentID, AgentState, Intention, Parcel, Position } from '../structs';
import { BeliefSet } from './beliefs';
import { Node } from './node';
import { GraphMap } from '../map';
import { JointIntention } from './structs';

export class Planner {
  private readonly _map: GraphMap;

  private readonly _beliefs: BeliefSet;

  private readonly _emitter: EventEmitter;

  private _root: Node | null = null;

  private _bestChild: Node | null = null;

  private _nextIteration?: NodeJS.Immediate;

  private _currentExecution?: NodeJS.Timeout;

  private readonly _duration: Duration;

  public constructor(map: GraphMap, id: AgentID, position: Position) {
    this._map = map;
    this._beliefs = new BeliefSet();
    this._emitter = new EventEmitter();

    if (process.env.FIRST_EXECUTION_DURATION === undefined) {
      throw new Error('FIRST_EXECUTION_DURATION is not defined');
    }
    this._duration = Duration.fromMilliseconds(parseInt(process.env.FIRST_EXECUTION_DURATION, 10));

    const agentsStates = new HashMap<AgentID, AgentState>();
    // we fake that the agent has just terminated a move intention
    // this is because a null intention means that the agent is waiting indefinitely
    // and this is not true
    agentsStates.set(id, new AgentState(position, null, [], Intention.move(position), true));

    this._root = new Node(
      this._beliefs,
      this._map,
      Instant.now(),
      this._beliefs.availablePositions,
      agentsStates
    );

    this._start(this._duration);
  }

  // -----------------------------------------------------------------------------------------------
  // Getters and setters
  // -----------------------------------------------------------------------------------------------

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

  // -----------------------------------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------------------------------

  // eslint-disable-next-line class-methods-use-this
  public mergeTeam(
    _newMembers: [AgentID, AgentState][],
    parcels: Parcel[],
    visibleAgents: Agent[]
  ): void {
    this._beliefs.updateState(parcels, visibleAgents);
    throw new Error('Not implemented');
  }

  public stop() {
    this._stop();
    this._root = null;
  }

  public onExecuteJointIntention(callback: (joint: JointIntention) => void) {
    this._emitter.on('execute', callback);
  }

  // -----------------------------------------------------------------------------------------------
  // Private methods
  // -----------------------------------------------------------------------------------------------

  private _start(executionDuration: Duration) {
    clearImmediate(this._nextIteration);
    this._nextIteration = undefined;

    this._run();

    this._currentExecution = setTimeout(() => {
      const [joint, bestChild] = this._root!.getBestSuccessor();
      const elapsed = bestChild.instant.subtract(this._root!.instant);
      this._root = bestChild;

      this._emitter.emit('execute', joint);

      this._start(elapsed);
    }, executionDuration.milliseconds);
  }

  private _run() {
    if (this._root === null) {
      throw new Error('The planner is not running.');
    }

    let node = this._root;
    while (!node.isTerminal()) {
      node = node.selectChild();
    }

    node.backpropagate(0, null);

    this._nextIteration = setImmediate(this._run.bind(this));
  }

  private _stop() {
    clearImmediate(this._nextIteration);
    clearTimeout(this._currentExecution);
    this._nextIteration = undefined;
    this._currentExecution = undefined;
  }
}
