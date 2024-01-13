//
//
//

import workerpool from "workerpool";

import * as math from "mathjs";
import { Matrix } from "mathjs";

workerpool.worker({
    createPairsDistanceMatrix,
});

function createPairsDistanceMatrix(adj: number[][]): number[][] {
    const adjMatrix = math.matrix(adj);
    return computeDistances(adjMatrix).toArray() as number[][];
}

function computeDistances(adj: Matrix): Matrix {
    math.matrix(adj);
    const adjArray = adj.toArray() as number[][];

    if (
        adjArray.every((row, i) =>
            row.every((_, j) => i === j || adjArray[i][j]),
        )
    ) {
        return adj;
    }

    const z = math.pow(adj, 2) as Matrix;
    const b = math.map(z, (value: number, index: [number, number], _) =>
        index[0] !== index[1] && (adj.get(index) === 1 || value > 0) ? 1 : 0,
    );
    const t = computeDistances(b);
    const x = math.multiply(t, adj);
    const degree = adjArray.map((row: number[], _index, _array) =>
        row.reduce((acc, val) => acc + val, 0),
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
