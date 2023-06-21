//
//
//

import { Matrix } from 'mathjs';
import * as math from 'mathjs';
import { GridSize, Location, Tile } from 'src/domain/models';
import { HashMap } from 'src/utils';

export function createAdjacencyMatrix(size: GridSize, tiles: Tile[]): Matrix {
  const adj = math.zeros(tiles.length, tiles.length) as Matrix;
  const indexes: HashMap<Location, number> = HashMap.new();

  for (const [index, tile] of tiles.entries()) {
    indexes.set(tile.position, index);
  }

  for (const [index, tile] of tiles.entries()) {
    for (const n of tile.position.neigbours(size)) {
      const neighbour_index = indexes.get(n);
      if (neighbour_index !== undefined) {
        adj.set([index, neighbour_index], 1);
      }
    }
  }

  return adj;
}

export function allPairsDistance(adj: Matrix): Matrix {
  const adj_array = adj.toArray() as number[][];

  if (
    adj_array.every((row, i) => row.every((_, j) => i === j || adj_array[i][j]))
  ) {
    return adj;
  }

  const z = math.pow(adj, 2) as Matrix;
  const b = math.map(z, (value: number, index: [number, number], _) =>
    index[0] !== index[1] && (adj.get(index) === 1 || value > 0) ? 1 : 0
  );
  const t = allPairsDistance(b);
  const x = math.multiply(t, adj);
  const degree = adj_array.map((row: number[], _index, _array) =>
    row.reduce((acc, val) => acc + val, 0)
  );

  const d = math.map(t, (tij: number, index: [number, number], _) => {
    const xij = x.get(index);
    const dj = degree[index[1]];
    if (xij >= tij * dj) {
      return 2 * tij;
    }
    return 2 * tij - 1;
  });

  return d;
}

export function createDistanceMatrix(
  size: GridSize,
  tiles: Tile[],
  distances: Matrix
): Matrix {
  const numNodes = size.rows * size.columns;
  const res = math.zeros(numNodes, numNodes) as Matrix;
  distances.forEach((value: number, index, _) => {
    const tile = tiles[index[0]];
    const neighbour = tiles[index[1]];

    const tileIndex = tile.position.toIndex(size);
    const neigbourIndex = neighbour.position.toIndex(size);

    res.set([tileIndex, neigbourIndex], value);
  });

  return res;
}
