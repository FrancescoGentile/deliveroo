//
//
//

import EventEmitter from 'eventemitter3';

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
} from 'src/domain/structs';
import { Sensors } from 'src/domain/ports';
import { Map, buildMap } from './map';
import { kmax } from './utils';

interface State {
  freeParcels: HashMap<ParcelID, Parcel>;
  agents: HashMap<AgentID, Agent>;
  visibleAgents: Agent[];
}

export class Environment {
  private _map!: Map;

  private _parcelRadius: number = 0;

  private _position: Position = new Position(0, 0);

  private readonly _state: State = {
    freeParcels: new HashMap(),
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
        } else {
          // the parcel is new
          this._state.freeParcels.set(parcel.id, parcel);
          change.newFreeParcels.push(parcel);
        }
      } else if (this._state.freeParcels.has(parcel.id)) {
        // the parcel was free and is now carried
        this._state.freeParcels.delete(parcel.id);
        change.noLongerFreeParcels.push(parcel);
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
    for (const parcel of this._state.freeParcels.values()) {
      if (parcel.value.getValueByInstant() === 0) {
        this._state.freeParcels.delete(parcel.id);
      }
    }
  }

  public onEnviromentChange(callback: (change: EnviromentChange) => void) {
    this._broker.on('change', callback);
  }

  public getFreeParcels(): Parcel[] {
    return [...this._state.freeParcels.values()];
  }

  public getPromisingPositions(): [Position, number][] {
    const weights = this._map.tileWeights;
    const numTiles = this._map.crossableTiles.length;
    const radius = Config.getInstance().parcelRadius;

    const k = Math.ceil(numTiles / radius ** 2);

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
}
