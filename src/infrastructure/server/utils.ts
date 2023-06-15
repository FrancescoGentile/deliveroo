//
//
//

import { Socket } from 'socket.io-client';
import { Config, GridSize, Location, Position, Tile } from 'src/domain/models';
import { sleep } from 'src/utils';

export async function getInitialLocation(socket: Socket): Promise<Location> {
  let location;

  socket.once('you', (data: any) => {
    location = Position.new(data.x, data.y);
  });

  while (location === undefined) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }

  return location;
}

export async function getMap(socket: Socket): Promise<[GridSize, Tile[]]> {
  let availableTiles: Tile[];
  let gridSize: GridSize;

  socket.once('map', (width: number, height: number, tiles: any[]) => {
    gridSize = GridSize.new(width, height);
    availableTiles = tiles.map((tile) =>
      Tile.new(Position.new(tile.x, tile.y), tile.delivery, true)
    );
  });

  while (gridSize! === undefined) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }

  return [gridSize, availableTiles!];
}

export async function getConfig(socket: Socket): Promise<Config> {
  let config: Config;

  socket.once('config', (data: any) => {
    const parcelGenerationInterval =
      typeof data.PARCELS_GENERATION_INTERVAL === 'string'
        ? parseInt(data.PARCELS_GENERATION_INTERVAL.slice(0, -1), 10) * 1000
        : data.PARCELS_GENERATION_INTERVAL;

    const parcelRewardAverage =
      typeof data.PARCEL_REWARD_AVG === 'string'
        ? parseInt(data.PARCEL_REWARD_AVG, 10)
        : data.PARCEL_REWARD_AVG;

    const parcelRewardVariance =
      typeof data.PARCEL_REWARD_VARIANCE === 'string'
        ? parseInt(data.PARCEL_REWARD_VARIANCE, 10)
        : data.PARCEL_REWARD_VARIANCE;

    const parcelDecayingInterval =
      data.PARCEL_DECADING_INTERVAL.toLowerCase() === 'infinite'
        ? Infinity
        : parseInt(data.PARCEL_DECADING_INTERVAL.slice(0, -1), 10) * 1000;

    const movementSteps =
      typeof data.MOVEMENT_STEPS === 'string'
        ? parseInt(data.MOVEMENT_STEPS, 10)
        : data.MOVEMENT_STEPS;

    const movementDuration =
      typeof data.MOVEMENT_DURATION === 'string'
        ? parseInt(data.MOVEMENT_DURATION, 10)
        : data.MOVEMENT_DURATION;

    config = {
      parcelGenerationInterval,
      parcelRewardAverage,
      parcelRewardVariance,
      parcelDecayingInterval,
      movementSteps,
      movementDuration,
    };
  });

  while (config! === undefined) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }

  return config;
}
