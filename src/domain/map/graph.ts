//
//
//

import path from "path";
import { fileURLToPath } from "url";
import UndirectedGraph from "graphology";
import * as workerpool from "workerpool";

import { Tile } from "src/domain/structs";

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
                    graph.addUndirectedEdge(node, adjacent.hash(), {
                        weight: 1,
                    });
                }
            }
        }
    });

    const components = findConnectedComponents(graph);
    const adjacencyMatrices = components.map(computeAdjacencyMatrix);

    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const pool = workerpool.pool(path.join(dirname, "seidel.js"), {
        maxWorkers: adjacencyMatrices.length,
    });

    const distances = await Promise.all(
        adjacencyMatrices.map((matrix) => pool.exec("createPairsDistanceMatrix", [matrix])),
    );

    pool.terminate();

    for (let idx = 0; idx < components.length; idx += 1) {
        const component = components[idx];
        const distance = distances[idx];

        const nodes = component.nodes();
        for (const [i, node] of nodes.entries()) {
            for (const [j, neighbor] of nodes.entries()) {
                if (!graph.hasUndirectedEdge(node, neighbor)) {
                    graph.addUndirectedEdge(node, neighbor, {
                        weight: distance[i][j],
                    });
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
    const id = new Map<string, number>();
    graph.forEachNode((node) => {
        id.set(node, 0);
    });

    let counter = 0;
    graph.forEachNode((node) => {
        if (id.get(node) === 0) {
            counter += 1;
            ccdfs(graph, counter, node, id);
        }
    });

    const components: Graph[] = [];
    for (let i = 0; i < counter; i += 1) {
        components.push(new UndirectedGraph<Tile, Edge>());
    }

    graph.forEachNode((node) => {
        const component = components[id.get(node)! - 1];
        if (!component.hasNode(node)) {
            component.addNode(node, graph.getNodeAttributes(node));
        }

        graph.forEachNeighbor(node, (neighbor) => {
            if (!component.hasNode(neighbor)) {
                component.addNode(neighbor, graph.getNodeAttributes(neighbor));
            }

            if (!component.hasUndirectedEdge(node, neighbor)) {
                component.addUndirectedEdge(
                    node,
                    neighbor,
                    graph.getEdgeAttributes(node, neighbor),
                );
            }
        });
    });

    return components;
}

function ccdfs(graph: Graph, counter: number, node: string, id: Map<string, number>) {
    id.set(node, counter);
    graph.forEachNeighbor(node, (neighbor) => {
        if (id.get(neighbor) === 0) {
            ccdfs(graph, counter, neighbor, id);
        }
    });
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
