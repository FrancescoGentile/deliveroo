//
//
//

import { Matrix } from 'mathjs';
import * as math from 'mathjs';

import {
  Position,
  Direction,
  Parcel,
  Tile,
  ParcelID,
  GridSize,
  Location,
  EnviromentChange,
} from 'src/domain/models';
import { Environment, Server } from 'src/domain/ports';
import { HashMap } from 'src/utils';
import * as utils from './utils';

interface Map {
  size: GridSize;
  tiles: Matrix;
  distances: Matrix;
  closest: Matrix;
}

/**
 * An implementation of the environment that uses the
 * Seidel algorithm to compute the shortest paths.
 */
export class SeidelEnvironment implements Environment {
  private constructor(
    private readonly _map: Map,
    private readonly _parcels: HashMap<ParcelID, Parcel>,
    private readonly _locations: HashMap<ParcelID, Location>,
    private _changes: EnviromentChange | null
  ) {}

  public static new(server: Server): SeidelEnvironment {
    const { gridSize, crossableTiles } = server;

    const deliveryPositions = [];
    const tmp = math.zeros(gridSize.rows, gridSize.columns) as Matrix;
    const tiles = tmp.map((_value, index, _) =>
      Tile.new(Position.new(index[0], index[1]), false, false)
    );

    for (const tile of crossableTiles) {
      tiles.set([tile.position.row, tile.position.column], tile);
      if (tile.delivery) {
        deliveryPositions.push(tile.position);
      }
    }

    const adj = utils.createAdjacencyMatrix(gridSize, crossableTiles);
    let distances = utils.allPairsDistance(adj);
    distances = utils.createDistanceMatrix(gridSize, crossableTiles, distances);

    const closest = math.zeros(gridSize.rows, gridSize.columns) as Matrix;
    for (const tile of crossableTiles) {
      if (!tile.delivery) {
        let closestDelivery = deliveryPositions[0];
        let minDistance = distances.get([
          tile.position.toIndex(gridSize),
          closestDelivery.toIndex(gridSize),
        ]);

        for (let i = 1; i < deliveryPositions.length; i += 1) {
          const distance = distances.get([
            tile.position.toIndex(gridSize),
            deliveryPositions[i].toIndex(gridSize),
          ]);
          if (distance < minDistance) {
            minDistance = distance;
            closestDelivery = deliveryPositions[i];
          }
        }

        closest.set(
          [tile.position.row, tile.position.column],
          closestDelivery.toIndex(gridSize)
        );
      } else {
        closest.set(
          [tile.position.row, tile.position.column],
          tile.position.toIndex(gridSize)
        );
      }
    }

    const map = {
      size: gridSize,
      tiles,
      distances,
      closest,
    };

    const env = new SeidelEnvironment(map, HashMap.new(), HashMap.new(), null);
    server.onParcelsSensing(env._parcelsSensing.bind(env));

    return env;
  }

  private _parcelsSensing(parcels: [Parcel, Position][]) {
    for (const [id, parcel] of this._parcels.entries()) {
      if (parcel._value.getValueByInstant() === 0) {
        this._parcels.delete(id);
        this._locations.delete(id);
      }
    }

    const newParcels = [];

    for (const [parcel, location] of parcels) {
      if (!this._parcels.has(parcel._id)) {
        this._parcels.set(parcel._id, parcel);
        this._locations.set(parcel._id, location);
        newParcels.push(parcel);
      } else if (!this._locations.get(parcel._id)!.equals(location)) {
        this._locations.set(parcel._id, location);
      }
    }

    if (newParcels.length > 0) {
      this._changes = { newParcels };
    }
  }

  public getChanges(): EnviromentChange | null {
    const changes = this._changes;
    this._changes = null;
    return changes;
  }

  public getParcels(): HashMap<ParcelID, Parcel> {
    return this._parcels;
  }

  public getParcelLocation(parcelID: ParcelID): Location {
    return this._locations.get(parcelID)!;
  }

  public getTilebyLocation(position: Position): Tile {
    return this._map.tiles.get([position.row, position.column]) as Tile;
  }

  public distance(start: Position, end: Position): number {
    if (start.equals(end)) {
      return 0;
    }

    const distance = this._map.distances.get([
      start.toIndex(this._map.size),
      end.toIndex(this._map.size),
    ]);

    return distance > 0 ? distance : Number.POSITIVE_INFINITY;
  }

  public nextDirection(start: Position, end: Position): Direction | null {
    const distance = this.distance(start, end);

    let nextPosition: Position | null = null;
    // eslint-disable-next-line no-restricted-syntax
    for (const n of start.neigbours(this._map.size)) {
      if (this.distance(n, end) === distance - 1) {
        nextPosition = n;
        break;
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

  public closestDeliveryDistance(position: Position): number {
    return this.distance(
      position,
      Position.fromIndex(
        this._map.closest.get([position.row, position.column]),
        this._map.size
      )
    );
  }

  public getClosestDeliveryLocation(position: Position): Tile {
    return this.getTilebyLocation(
      Position.fromIndex(
        this._map.closest.get([position.row, position.column]),
        this._map.size
      )
    );
  }
}
