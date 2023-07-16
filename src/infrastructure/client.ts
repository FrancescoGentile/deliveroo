//
//
//

import { Socket, io } from 'socket.io-client';

import { Actuators, Sensors } from 'src/domain/ports';
import {
  AgentID,
  Config,
  DecayingValue,
  Direction,
  GridSize,
  Parcel,
  ParcelID,
  Position,
  Tile,
} from 'src/domain/structs';
import { HashSet, sleep } from 'src/utils';

export class Client implements Actuators, Sensors {
  private readonly _socket: Socket;

  private _agentPosition?: Position;

  private _crossableTiles?: Tile[];

  private _gridSize?: GridSize;

  private _config?: Config;

  public constructor(host: string, token: string) {
    this._socket = io(host, {
      extraHeaders: {
        'x-token': token,
      },
      autoConnect: true,
    });

    this._socket.on('you', this.setPosition.bind(this));
    this._socket.once('map', this.setMap.bind(this));
    this._socket.once('config', this.setConfig.bind(this));
  }

  private setPosition(agent: any) {
    this._agentPosition = new Position(agent.x, agent.y);
  }

  private setMap(width: number, height: number, tiles: any[]) {
    this._gridSize = new GridSize(width, height);
    this._crossableTiles = tiles.map(
      (tile) =>
        new Tile(
          new Position(tile.x, tile.y),
          tile.delivery,
          true,
          tile.parcelSpawner
        )
    );
  }

  private setConfig(config: any) {
    const parcelGenerationInterval =
      typeof config.PARCELS_GENERATION_INTERVAL === 'string'
        ? parseInt(config.PARCELS_GENERATION_INTERVAL.slice(0, -1), 10) * 1000
        : config.PARCELS_GENERATION_INTERVAL;

    const parcelRewardAverage =
      typeof config.PARCEL_REWARD_AVG === 'string'
        ? parseInt(config.PARCEL_REWARD_AVG, 10)
        : config.PARCEL_REWARD_AVG;

    const parcelRewardVariance =
      typeof config.PARCEL_REWARD_VARIANCE === 'string'
        ? parseInt(config.PARCEL_REWARD_VARIANCE, 10)
        : config.PARCEL_REWARD_VARIANCE;

    const parcelDecayingInterval =
      config.PARCEL_DECADING_INTERVAL.toLowerCase() === 'infinite'
        ? Infinity
        : parseInt(config.PARCEL_DECADING_INTERVAL.slice(0, -1), 10) * 1000;

    const movementSteps =
      typeof config.MOVEMENT_STEPS === 'string'
        ? parseInt(config.MOVEMENT_STEPS, 10)
        : config.MOVEMENT_STEPS;

    const movementDuration =
      typeof config.MOVEMENT_DURATION === 'string'
        ? parseInt(config.MOVEMENT_DURATION, 10)
        : config.MOVEMENT_DURATION;

    const parcelRadius = config.PARCELS_OBSERVATION_DISTANCE - 1;
    const agentRadius = config.AGENTS_OBSERVATION_DISTANCE - 1;

    this._config = {
      parcelGenerationInterval,
      parcelRewardAverage,
      parcelRewardVariance,
      parcelDecayingInterval,
      movementSteps,
      movementDuration,
      parcelRadius,
      agentRadius,
    };
  }

  public async getPosition(): Promise<Position> {
    while (this._agentPosition === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }

    return this._agentPosition;
  }

  public async getCrossableTiles(): Promise<Tile[]> {
    while (this._crossableTiles === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }

    return this._crossableTiles;
  }

  public async getGridSize(): Promise<GridSize> {
    while (this._gridSize === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }

    return this._gridSize;
  }

  public async getConfig(): Promise<Config> {
    while (this._config === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }

    return this._config;
  }

  public async move(direction: Direction): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      this._socket.emit(
        'move',
        direction,
        (response: boolean | PromiseLike<boolean>) => {
          resolve(response);
        }
      );
    });
  }

  public async pickup(): Promise<HashSet<ParcelID>> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('pickup', (response: any[]) => {
        const parcels: HashSet<ParcelID> = new HashSet<ParcelID>();
        // eslint-disable-next-line no-restricted-syntax
        for (const parcel of response) {
          parcels.add(new ParcelID(parcel.id));
        }

        resolve(parcels);
      });
    });
  }

  public async putdown(parcels: Parcel[] | null): Promise<HashSet<ParcelID>> {
    return new Promise((resolve, _reject) => {
      const ids =
        parcels !== null ? parcels.map((parcel) => parcel.id.toString()) : null;
      this._socket.emit('putdown', ids, (response: any[]) => {
        const putDownParcels: HashSet<ParcelID> = new HashSet<ParcelID>();
        // eslint-disable-next-line no-restricted-syntax
        for (const parcel of response) {
          putDownParcels.add(new ParcelID(parcel.id));
        }

        resolve(putDownParcels);
      });
    });
  }

  public onParcelSensing(callback: (parcels: HashSet<Parcel>) => void): void {
    this._socket.on('parcels sensing', (parcels) => {
      const newParcels = new HashSet<Parcel>();
      // eslint-disable-next-line no-restricted-syntax
      for (const parcel of parcels) {
        newParcels.add(
          new Parcel(
            new ParcelID(parcel.id),
            new DecayingValue(parcel.reward),
            new Position(parcel.x, parcel.y),
            parcel.carriedBy ? new AgentID(parcel.carriedBy) : null
          )
        );
      }

      callback(newParcels);
    });
  }

  public onPositionUpdate(callback: (position: Position) => void): void {
    this._socket.on('you', (agent) => {
      callback(new Position(agent.x, agent.y));
    });
  }
}
