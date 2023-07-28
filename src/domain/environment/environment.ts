//
//
//

import EventEmitter from 'eventemitter3';
import * as math from 'mathjs';
import { MinPriorityQueue } from '@datastructures-js/priority-queue';

import { HashMap, HashSet, Instant } from 'src/utils';
import {
  Agent,
  AgentID,
  Config,
  Direction,
  Parcel,
  Position,
  Tile,
  PDDLProblem,
  ParcelID,
} from 'src/domain/structs';
import { Sensors } from 'src/domain/ports';
import { Map, buildMap } from './map';
import { kmax } from './utils';

interface State {
  freeParcels: HashMap<ParcelID, Parcel>;
  positionToParcels: HashMap<Position, Parcel[]>;
  agents: HashMap<AgentID, Agent>;
  visibleAgents: Agent[];
  numSmartAgents: number;
}

export class Environment {
  private _map!: Map;

  private _parcelRadius?: number;

  private _position?: Position;

  private _id?: AgentID;

  private readonly _state: State = {
    freeParcels: new HashMap(),
    positionToParcels: new HashMap(),
    agents: new HashMap(),
    visibleAgents: [],
    numSmartAgents: 1, // the main player is always smart
  };

  private readonly _broker: EventEmitter = new EventEmitter();

  public static async new(sensors: Sensors): Promise<Environment> {
    const env = new Environment();
    sensors.onParcelSensing((parcels) => env.onParcelSensing(parcels));
    sensors.onPositionUpdate((position) => {
      env._position = position;
    });

    setInterval(() => env.removeDeadParcels(), 10000);

    const [config, size, tiles, id] = await Promise.all([
      sensors.getConfig(),
      sensors.getGridSize(),
      sensors.getCrossableTiles(),
      sensors.getID(),
    ]);
    Config.configure(config);
    env._parcelRadius = config.parcelRadius;
    env._id = id;

    const map = await buildMap(size, tiles);
    env._map = map;

    sensors.onAgentSensing((agents) => env.onAgentSensing(agents));

    return env;
  }

  private removeParcel(parcel: Parcel, position_only: boolean = false) {
    if (!position_only) {
      this._state.freeParcels.delete(parcel.id);
    }

    const parcelsInPosition = this._state.positionToParcels.get(parcel.position);
    if (parcelsInPosition !== undefined) {
      const idx = parcelsInPosition.findIndex((p) => p.id.equals(parcel.id));
      if (idx !== -1) {
        parcelsInPosition.splice(idx, 1);
      }

      if (parcelsInPosition.length === 0) {
        this._state.positionToParcels.delete(parcel.position);
      }
    }
  }

  private onParcelSensing(visibleParcels: HashSet<Parcel>) {
    let isChanged = false;

    if (this._position !== undefined && this._parcelRadius !== undefined) {
      for (const parcel of this._state.freeParcels.values()) {
        if (
          !visibleParcels.has(parcel) &&
          this._position.manhattanDistance(parcel.position) <= this._parcelRadius
        ) {
          // the parcel is no longer visible
          this.removeParcel(parcel);
          isChanged = true;
        }
      }
    }

    for (const parcel of visibleParcels.values()) {
      if (parcel.agentID === null) {
        // the parcel is free
        if (this._state.freeParcels.has(parcel.id)) {
          // the parcel was already free
          const oldParcel = this._state.freeParcels.get(parcel.id)!;
          if (!oldParcel.position.equals(parcel.position)) {
            // the parcel has changed position
            this.removeParcel(oldParcel, true);
            this._state.freeParcels.set(parcel.id, parcel);
            const parcelsInPosition = this._state.positionToParcels.get(parcel.position) || [];
            parcelsInPosition.push(parcel);
            this._state.positionToParcels.set(parcel.position, parcelsInPosition);
            isChanged = true;
          }
        } else {
          // the parcel is new
          this._state.freeParcels.set(parcel.id, parcel);
          const parcelsInPosition = this._state.positionToParcels.get(parcel.position) || [];
          parcelsInPosition.push(parcel);
          this._state.positionToParcels.set(parcel.position, parcelsInPosition);

          isChanged = true;
        }
      } else if (this._state.freeParcels.has(parcel.id)) {
        // the parcel was free and is now carried
        this.removeParcel(parcel);
        if (!this._id?.equals(parcel.agentID)) {
          // the parcel is not carried by the main player
          isChanged = true;
        }
      }
    }

    if (isChanged) {
      this._broker.emit('change');
    }
  }

  private removeDeadParcels() {
    for (const parcel of this._state.freeParcels.values()) {
      if (parcel.value.getValueByInstant() === 0) {
        this.removeParcel(parcel);
      }
    }
  }

  private onAgentSensing(agents: Agent[]) {
    const now = Instant.now();
    const numTiles = this._map.size.rows * this._map.size.columns;
    const avgParcelsDistance = numTiles / Config.getInstance().maxParcels;
    this._state.visibleAgents = [];

    for (const agent of agents) {
      // agent seen before
      if (this._state.agents.has(agent.id)) {
        const oldAgent = this._state.agents.get(agent.id)!;
        const visitedTiles =
          now.subtract(oldAgent.firstSeen).milliseconds /
          Config.getInstance().movementDuration.milliseconds;
        const avgScore =
          ((visitedTiles / avgParcelsDistance) * Config.getInstance().parcelRewardAverage) /
          this._state.numSmartAgents;

        let random = false;
        if (Config.getInstance().randomAgents > 0) {
          random = avgScore > agent.score;
        }

        const updatedAgent = new Agent(
          agent.id,
          agent.currentPosition,
          agent.score,
          oldAgent.firstSeen,
          random
        );

        this._state.agents.set(agent.id, updatedAgent);
        this._state.visibleAgents.push(updatedAgent);
      } else {
        this._state.agents.set(agent.id, agent);
        agent.random = false;
        this._state.visibleAgents.push(agent);
      }
    }
  }

  public onEnvironmentChange(callback: () => void) {
    this._broker.on('change', callback);
  }

  public getParcelsPositions(): Position[] {
    return [...this._state.positionToParcels.keys()];
  }

  public getParcelsByPosition(position: Position): Parcel[] {
    return this._state.positionToParcels.get(position) || [];
  }

  public getPromisingPositions(playerPosition: Position): [Position, number][] {
    const weights = this._map.tileWeights;
    const numTiles = this._map.crossableTiles.length;
    const { parcelRadius, agentRadius } = Config.getInstance();
    const std = 1.0;
    const agentsPositions = [
      ...this._state.visibleAgents.map((agent) => agent.currentPosition),
      playerPosition,
    ];
    for (const position of agentsPositions) {
      for (let i = -agentRadius; i <= agentRadius; i += 1) {
        for (let j = -agentRadius; j <= agentRadius; j += 1) {
          const level = Math.abs(i) + Math.abs(j);
          if (level > agentRadius) {
            // eslint-disable-next-line no-continue
            continue;
          }

          const pos = new Position(position.row + i, position.column + j);
          if (!pos.isValid(this._map.size)) {
            // eslint-disable-next-line no-continue
            continue;
          }

          const idx = this._map.crossableIndexes.get(pos)!;
          weights[idx] -= math.exp(-((i * i + j * j) / (2 * std * std)));
        }
      }
    }
    const k = Math.ceil(numTiles / parcelRadius ** 2);

    const [values, indexes] = kmax(weights, k);

    return values.map((value, idx) => [this._map.crossableTiles[indexes[idx]].position, value]);
  }

  public getTileByPosition(position: Position): Tile {
    const idx = this._map.crossableIndexes.get(position);
    if (idx === undefined) {
      throw new Error('Position not crossable');
    }

    return this._map.crossableTiles[idx];
  }

  public distance(start: Position, end: Position): number {
    const startIdx = this._map.crossableIndexes.get(start);
    const endIdx = this._map.crossableIndexes.get(end);

    if (startIdx === undefined || endIdx === undefined) {
      throw new Error('Position not crossable');
    }

    return this._map.distances.get([startIdx, endIdx]);
  }

  public nextDirection(start: Position, end: Position): Direction | null {
    const distance = this.distance(start, end);

    let nextPosition: Position | null = null;
    // eslint-disable-next-line no-restricted-syntax
    for (const n of start.neigbours(this._map.size)) {
      try {
        if (this.distance(n, end) === distance - 1) {
          nextPosition = n;
          break;
        }
      } catch (e) {
        // eslint-disable-next-line no-empty
      }
    }

    if (nextPosition === null) {
      return null;
    }

    if (nextPosition.row === start.row) {
      if (nextPosition.column > start.column) {
        return Direction.UP;
      }
      return Direction.DOWN;
    }
    if (nextPosition.row > start.row) {
      return Direction.RIGHT;
    }

    return Direction.LEFT;
  }

  /**
   * Computes the shortest path from start to end taking into account the
   * current state of the environment.
   * @param start The starting position.
   * @param end The ending position.
   * @returns The shortest path from start to end or null if no path exists.
   */
  public recomputePath(start: Position, end: Position): Direction[] | null {
    const positions = this._map.crossableIndexes.copy();
    for (const agent of this._state.visibleAgents) {
      positions.delete(agent.currentPosition);
    }

    const frontier = new MinPriorityQueue<[Position, number]>((v) => v[1]);

    frontier.enqueue([start, 0]);
    const cameFrom = new HashMap<Position, Position | null>();
    const costSoFar = new HashMap<Position, number>();
    cameFrom.set(start, null);
    costSoFar.set(start, 0);

    while (frontier.size() > 0) {
      const current = frontier.dequeue()[0];

      if (current.equals(end)) {
        break;
      }

      for (const next of current.neigbours(this._map.size)) {
        if (!positions.has(next)) {
          continue;
        }

        const newCost = costSoFar.get(current)! + 1;
        if (!costSoFar.has(next) || newCost < costSoFar.get(next)!) {
          costSoFar.set(next, newCost);
          const priority = newCost + this.distance(next, end);
          frontier.enqueue([next, priority]);
          cameFrom.set(next, current);
        }
      }
    }

    if (!cameFrom.has(end)) {
      return null;
    }

    const path: Direction[] = [];
    let current = end;
    while (!current.equals(start)) {
      const previous = cameFrom.get(current)!;
      path.push(this.nextDirection(previous, current)!);
      current = previous;
    }

    return path.reverse();
  }

  public getClosestDeliveryPosition(position: Position): Position {
    const startIdx = this._map.crossableIndexes.get(position);
    if (startIdx === undefined) {
      throw new Error('Position not crossable');
    }

    return this._map.closestDelivery[startIdx];
  }

  public getVisibleAgents(): Agent[] {
    return this._state.visibleAgents;
  }

  public toPDDL(): PDDLProblem {
    const tiles = this._map.crossableTiles.map(
      (tile) => `(t_${tile.position.row}_${tile.position.column})`
    );

    const neigbours = [];
    for (const tile of this._map.crossableTiles) {
      for (const neighbour of tile.position.neigbours(this._map.size)) {
        neigbours.push(
          `(${this.nextDirection(tile.position, neighbour)} t_${tile.position.row}_${
            tile.position.column
          } t_${neighbour.row}_${neighbour.column})`
        );
      }
    }

    return new PDDLProblem(tiles, neigbours, ['']);
  }
}
