//
//
//

import EventEmitter from 'eventemitter3';

import { HashMap } from 'src/utils';
import {
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
  freeParcels: HashMap<ParcelID, [Parcel, Position]>;
  carriedParcels: HashMap<ParcelID, [Parcel, AgentID]>;
}

export class Environment {
  private _map!: Map;

  private readonly _state: State = {
    freeParcels: new HashMap(),
    carriedParcels: new HashMap(),
  };

  private readonly _broker: EventEmitter = new EventEmitter();

  public static async new(sensors: Sensors): Promise<Environment> {
    const env = new Environment();
    sensors.onParcelSensing((parcels) => env.onParcelSensing(parcels));
    setInterval(() => env.removeDeadParcels(), 10000);

    const [config, size, tiles] = await Promise.all([
      sensors.getConfig(),
      sensors.getGridSize(),
      sensors.getCrossableTiles(),
    ]);
    Config.configure(config);

    const map = await buildMap(size, tiles);
    env._map = map;

    return env;
  }

  private onParcelSensing(parcels: [Parcel, Position, AgentID | null][]) {
    const change: EnviromentChange = {
      newFreeParcels: [],
      nowCarriedParcels: [],
    };

    for (const [parcel, position, agentID] of parcels) {
      if (agentID === null) {
        if (this._state.freeParcels.has(parcel.id)) {
          // the parcel is still free
          this._state.freeParcels.set(parcel.id, [parcel, position]);
        } else if (this._state.carriedParcels.has(parcel.id)) {
          // the parcel was carried and is now free
          this._state.carriedParcels.delete(parcel.id);
          this._state.freeParcels.set(parcel.id, [parcel, position]);
          change.newFreeParcels.push([parcel, position]);
        } else {
          // the parcel is new
          this._state.freeParcels.set(parcel.id, [parcel, position]);
          change.newFreeParcels.push([parcel, position]);
        }
      } else if (this._state.freeParcels.has(parcel.id)) {
        // the parcel was free and is now carried
        this._state.freeParcels.delete(parcel.id);
        this._state.carriedParcels.set(parcel.id, [parcel, agentID]);
        change.nowCarriedParcels.push([parcel, agentID]);
      } else if (this._state.carriedParcels.has(parcel.id)) {
        // the parcel is still carried
        this._state.carriedParcels.set(parcel.id, [parcel, agentID]);
      } else {
        // the parcel is new
        this._state.carriedParcels.set(parcel.id, [parcel, agentID]);
      }
    }

    if (
      change.newFreeParcels.length > 0 ||
      change.nowCarriedParcels.length > 0
    ) {
      this._broker.emit('change', change);
    }
  }

  private removeDeadParcels() {
    for (const [id, [parcel, _]] of this._state.freeParcels.entries()) {
      if (parcel.value.getValueByInstant() === 0) {
        this._state.freeParcels.delete(id);
      }
    }

    for (const [id, [parcel, _]] of this._state.carriedParcels.entries()) {
      if (parcel.value.getValueByInstant() === 0) {
        this._state.carriedParcels.delete(id);
      }
    }
  }

  public onEnviromentChange(callback: (change: EnviromentChange) => void) {
    this._broker.on('change', callback);
  }

  public getFreeParcels(): [Parcel, Position][] {
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
