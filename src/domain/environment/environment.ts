//
//
//

import EventEmitter from 'eventemitter3';
import * as math from 'mathjs';
import { HashMap, HashSet } from 'src/utils';
import {
  Agent,
  AgentID,
  Config,
  Direction,
  EnviromentChange,
  Parcel,
  ParcelID,
  Position,
  Tile,
  AgentType,
  PDDLProblem,
} from 'src/domain/structs';
import { Sensors } from 'src/domain/ports';
import { Map, buildMap } from './map';
import { kmax } from './utils';

interface State {
  freeParcels: HashMap<ParcelID, Parcel>;
  carriedParcels: HashMap<ParcelID, Parcel>;
  agents: HashMap<AgentID, Agent>;
  visibleAgents: Agent[];
}

export class Environment {
  private _map!: Map;

  private _parcelRadius: number = 0;

  private _position: Position = new Position(0, 0);

  private readonly _state: State = {
    freeParcels: new HashMap(),
    carriedParcels: new HashMap(),
    agents: new HashMap(),
    visibleAgents: [],
  };

  private readonly _broker: EventEmitter = new EventEmitter();

  public static async new(sensors: Sensors): Promise<Environment> {
    const env = new Environment();
    sensors.onParcelSensing((parcels) => env.onParcelSensing(parcels));
    sensors.onPositionUpdate((position) => {
      env._position = position;
    });

    setInterval(() => env.removeDeadParcels(), 10000);

    const [config, size, tiles] = await Promise.all([
      sensors.getConfig(),
      sensors.getGridSize(),
      sensors.getCrossableTiles(),
    ]);
    Config.configure(config);
    env._parcelRadius = config.parcelRadius;

    sensors.onAgentSensing((agents) =>
      env.onAgentSensing(agents, tiles.length)
    );

    const map = await buildMap(size, tiles);
    env._map = map;

    return env;
  }

  private onParcelSensing(parcels: HashSet<Parcel>) {
    const change: EnviromentChange = {
      newFreeParcels: [],
      noLongerFreeParcels: [],
    };

    for (const parcel of this._state.freeParcels.values()) {
      if (
        !parcels.has(parcel) &&
        this._position.manhattanDistance(parcel.position) <= this._parcelRadius
      ) {
        this._state.freeParcels.delete(parcel.id);
        change.noLongerFreeParcels.push(parcel);
      }
    }

    for (const parcel of parcels.values()) {
      if (parcel.agentID === null) {
        if (this._state.freeParcels.has(parcel.id)) {
          // the parcel is still free
          this._state.freeParcels.set(parcel.id, parcel);
        } else if (this._state.carriedParcels.has(parcel.id)) {
          // the parcel was carried and is now free
          this._state.carriedParcels.delete(parcel.id);
          this._state.freeParcels.set(parcel.id, parcel);
          change.newFreeParcels.push(parcel);
        } else {
          // the parcel is new
          this._state.freeParcels.set(parcel.id, parcel);
          change.newFreeParcels.push(parcel);
        }
      } else if (this._state.freeParcels.has(parcel.id)) {
        // the parcel was free and is now carried
        this._state.freeParcels.delete(parcel.id);
        this._state.carriedParcels.set(parcel.id, parcel);
        change.noLongerFreeParcels.push(parcel);
      } else if (this._state.carriedParcels.has(parcel.id)) {
        // the parcel is still carried
        this._state.carriedParcels.set(parcel.id, parcel);
      } else {
        // the parcel is new
        this._state.carriedParcels.set(parcel.id, parcel);
      }
    }

    if (
      change.newFreeParcels.length > 0 ||
      change.noLongerFreeParcels.length > 0
    ) {
      this._broker.emit('change', change);
    }
  }

  private removeDeadParcels() {
    for (const [id, parcel] of this._state.freeParcels.entries()) {
      if (parcel.value.getValueByInstant() === 0) {
        this._state.freeParcels.delete(id);
      }
    }

    for (const [id, parcel] of this._state.carriedParcels.entries()) {
      if (parcel.value.getValueByInstant() === 0) {
        this._state.carriedParcels.delete(id);
      }
    }
  }

  private onAgentSensing(agents: Agent[], tiles: number) {
    const now = Date.now();
    const avgParcelsDistance = tiles / Config.getInstance().maxParcels;
    for (const agent of agents) {
      // agent seen before
      if (this._state.agents.has(agent.id)) {
        const oldAgent = this._state.agents.get(agent.id)!;
        const visitedTiles =
          now - oldAgent.lastSeen * Config.getInstance().movementDuration;
        const avgScore =
          ((visitedTiles / avgParcelsDistance) *
            Config.getInstance().parcelRewardAverage) /
          Config.getInstance().randomAgents;
        let agentType = AgentType.SMART;
        if (Config.getInstance().randomAgents > 0) {
          agentType =
            avgScore > agent.score - oldAgent.score
              ? AgentType.RANDOM
              : AgentType.SMART;
        }
        const updatedAgent = new Agent(
          agent.id,
          agent.position,
          agent.carriedParcels,
          agent.score,
          agentType,
          now
        );
        this._state.agents.set(agent.id, updatedAgent);
      } else {
        this._state.agents.set(agent.id, agent);
      }

      if (this._state.visibleAgents.includes(agent)) {
        const idx = this._state.visibleAgents.indexOf(agent);
        const oldAgent = this._state.visibleAgents[idx];
        this._state.visibleAgents[idx] = agent;
        this._state.visibleAgents[idx].type = oldAgent.type;
      } else {
        this._state.visibleAgents.push(agent);
      }
    }
  }

  public onEnviromentChange(callback: (change: EnviromentChange) => void) {
    this._broker.on('change', callback);
  }

  public getFreeParcels(): Parcel[] {
    return [...this._state.freeParcels.values()];
  }

  public getPromisingPositions(playerPosition: Position): [Position, number][] {
    const weights = this._map.tileWeights;
    const numTiles = this._map.crossableTiles.length;
    const { parcelRadius } = Config.getInstance();
    const { agentRadius } = Config.getInstance();
    const std = 1.0;
    const agentsPositions = [
      ...this._state.visibleAgents.map((agent) => agent.position),
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

    return values.map((value, idx) => [
      this._map.crossableTiles[indexes[idx]].position,
      value,
    ]);
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
          `(${this.nextDirection(tile.position, neighbour)} t_${
            tile.position.row
          }_${tile.position.column} t_${neighbour.row}_${neighbour.column})`
        );
      }
    }

    return new PDDLProblem(tiles, neigbours, ['']);
  }
}
