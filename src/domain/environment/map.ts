//
//
//

import { fileURLToPath } from 'url';
import path from 'path';

import * as workerpool from 'workerpool';
import * as math from 'mathjs';
import { Matrix } from 'mathjs';

import { Config, GridSize, Position, Tile } from 'src/domain/structs';
import { HashMap } from 'src/utils';

export interface Map {
  size: GridSize;
  crossableTiles: Tile[]; // length: N
  crossableIndexes: HashMap<Position, number>;
  distances: Matrix; // shape: [N, N]
  closestDelivery: Position[]; // length: N
  tileWeights: number[]; // length: N
}

export async function buildMap(
  size: GridSize,
  crossableTiles: Tile[]
): Promise<Map> {
  const deliveryPositions: Position[] = [];

  const crossableIndexes = new HashMap<Position, number>();
  for (const [index, tile] of crossableTiles.entries()) {
    crossableIndexes.set(tile.position, index);
    if (tile.delivery) {
      deliveryPositions.push(tile.position);
    }
  }

  if (deliveryPositions.length === 0) {
    throw new Error('No delivery positions found');
  }

  const adj = createAdjacencyMatrix(size, crossableIndexes);

  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const pool = workerpool.pool(path.join(dirname, 'seidel.js'), {
    maxWorkers: 1,
  });

  const distancesArray = await pool.exec('createPairsDistanceMatrix', [
    adj.toArray(),
  ]);
  pool.terminate();
  const distances = math.matrix(distancesArray);

  const closestDelivery = crossableTiles.map((tile) => {
    if (tile.delivery) {
      return tile.position;
    }

    let closest = null;
    let minDistance = Infinity;

    for (const delivery of deliveryPositions) {
      const distance = distances.get([
        crossableIndexes.get(tile.position)!,
        crossableIndexes.get(delivery)!,
      ]);
      if (distance < minDistance) {
        minDistance = distance;
        closest = delivery;
      }
    }

    return closest!;
  });

  const tileWeights = getTileWeights(size, crossableTiles, crossableIndexes);

  return {
    size,
    crossableTiles,
    crossableIndexes,
    distances,
    closestDelivery,
    tileWeights,
  };
}

function createAdjacencyMatrix(
  size: GridSize,
  indexes: HashMap<Position, number>
): Matrix {
  const adj = math.zeros(indexes.size, indexes.size) as Matrix;

  for (const [position, idx] of indexes.entries()) {
    for (const neighbourPos of position.neigbours(size)) {
      const neighbourIdx = indexes.get(neighbourPos);
      if (neighbourIdx !== undefined) {
        adj.set([idx, neighbourIdx], 1);
      }
    }
  }

  return adj;
}

function getTileWeights(
  size: GridSize,
  tiles: Tile[],
  indexes: HashMap<Position, number>
): number[] {
  const std = 1.0;
  const radius = Config.getInstance().parcelRadius;
  const weights = tiles.map(() => 0);

  for (const tile of tiles) {
    if (!tile.spawn) {
      // eslint-disable-next-line no-continue
      continue;
    }

    for (let i = -radius; i <= radius; i += 1) {
      for (let j = -radius; j <= radius; j += 1) {
        const level = Math.abs(i) + Math.abs(j);
        if (level > radius) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const pos = new Position(
          tile.position.row + i,
          tile.position.column + j
        );
        if (!pos.isValid(size)) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const idx = indexes.get(pos)!;
        weights[idx] += math.exp(-((i * i + j * j) / (2 * std * std)));
      }
    }
  }

  return weights;
}
