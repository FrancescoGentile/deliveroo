//
//
//

import { GraphMap } from 'src/logic/map';
import { AgentID, Position } from 'src/logic/structs';
import { Actuators, Messenger, Sensors } from 'src/logic/ports';
import { Planner } from 'src/logic/planner';
import { BeliefSet } from './beliefs';

export class Player {
  private readonly _map: GraphMap;

  private readonly _beliefs: BeliefSet;

  private readonly _actuators: Actuators;

  private readonly _messenger: Messenger;

  private readonly _planner: Planner;

  public constructor(
    id: AgentID,
    position: Position,
    map: GraphMap,
    sensors: Sensors,
    actuators: Actuators,
    messenger: Messenger
  ) {
    this._map = map;
    this._beliefs = new BeliefSet(id, position, sensors);
    this._actuators = actuators;
    this._messenger = messenger;
    this._planner = new Planner();
  }

  // eslint-disable-next-line class-methods-use-this
  public async start() {
    //
  }
}
