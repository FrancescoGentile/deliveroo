//
//
//

import { fileURLToPath } from 'url';
import path from 'path';
import UndirectedGraph from 'graphology';
import * as workerpool from 'workerpool';

import { Tile } from 'src/logic/structs';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type Graph = UndirectedGraph<Tile, Edge>;

/**
 * Creates a new graph from the given tiles.
 * @param tiles The tiles in the environment that are walkable.
 * @returns A new graph.
 */
export async function buildGraph(tiles: Tile[]): Promise<Graph> {
  const graph = new UndirectedGraph<Tile, Edge>({ allowSelfLoops: true });

  for (const tile of tiles) {
    graph.addNode(tile.position.hash(), tile);
  }

  graph.forEachNode((node, tile) => {
    for (const adjacent of tile.position.adjacent()) {
      if (graph.hasNode(adjacent.hash())) {
        if (!graph.hasUndirectedEdge(node, adjacent.hash())) {
          graph.addUndirectedEdge(node, adjacent.hash(), { weight: 1 });
        }
      }
    }
  });

  const components = findConnectedComponents(graph);
  const adjacencyMatrices = components.map(computeAdjacencyMatrix);

  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const pool = workerpool.pool(path.join(dirname, 'seidel.js'), {
    maxWorkers: adjacencyMatrices.length,
  });

  const distances = await Promise.all(
    adjacencyMatrices.map((matrix) => pool.exec('createPairsDistanceMatrix', [matrix]))
  );

  pool.terminate();

  for (let idx = 0; idx < components.length; idx += 1) {
    const component = components[idx];
    const distance = distances[idx];

    const nodes = component.nodes();
    for (const [i, node] of nodes.entries()) {
      for (const [j, neighbor] of nodes.entries()) {
        if (!component.hasUndirectedEdge(node, neighbor)) {
          component.addUndirectedEdge(node, neighbor, { weight: distance[i][j] });
        }
      }
    }
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Private API
// ---------------------------------------------------------------------------

interface Edge {
  weight: number;
}

function findConnectedComponents(graph: Graph): Graph[] {
  const components: Graph[] = [];

  const visited = new Set<string>();

  graph.forEachNode((node) => {
    if (!visited.has(node)) {
      const component = new UndirectedGraph<Tile, Edge>();
      const queue = [node];
      visited.add(node);

      while (queue.length > 0) {
        const current = queue.pop()!;
        if (!component.hasNode(current)) {
          component.addNode(current, graph.getNodeAttributes(current)!);
        }
        graph.forEachNeighbor(current, (neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            component.addNode(neighbor, graph.getNodeAttributes(neighbor)!);
            if (!component.hasUndirectedEdge(current, neighbor)) {
              component.addUndirectedEdge(
                current,
                neighbor,
                graph.getEdgeAttributes(current, neighbor)!
              );
            }
            queue.push(neighbor);
          }
        });
      }

      components.push(component);
    }
  });

  return components;
}
function computeAdjacencyMatrix(graph: Graph): number[][] {
  const matrix: number[][] = [];

  graph.forEachNode((node) => {
    const row: number[] = [];
    graph.forEachNode((neighbor) => {
      row.push(graph.hasUndirectedEdge(node, neighbor) ? 1 : 0);
    });

    matrix.push(row);
  });
  return matrix;
}
