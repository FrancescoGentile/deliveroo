//
//
//

import { Direction, Position, Tile } from "src/domain/structs";
import { Graph, buildGraph } from "./graph";

export class GridMap {
    private constructor(
        private readonly _graph: Graph,
        public readonly nRows: number,
        public readonly nCols: number,
        public readonly tiles: Tile[],
        public readonly deliveryTiles: Tile[],
    ) {}

    /**
     * Creates a new graph from the given tiles.
     *
     * @param tiles The tiles in the environment that are walkable.
     *
     * @returns A new graph.
     */
    public static async new(tiles: Tile[], position: Position): Promise<GridMap> {
        const graph = await buildGraph(tiles);
        const deliveryTiles = tiles.filter(
            (tile) =>
                tile.delivery && graph.hasUndirectedEdge(position.hash(), tile.position.hash()),
        );

        let nRows = 0;
        let nCols = 0;
        for (const tile of tiles) {
            nRows = Math.max(nRows, tile.position.row);
            nCols = Math.max(nCols, tile.position.column);
        }

        return new GridMap(graph, nRows + 1, nCols + 1, tiles, deliveryTiles);
    }

    /**
     * Returns the length of the shortest path between the two positions.
     *
     * @param from The starting position.
     * @param to The ending position.
     *
     * @returns The length of the shortest path between the two positions.
     *
     * @throws If no path exists between the two positions.
     */
    public distance(from: Position, to: Position): number {
        if (!this._graph.hasUndirectedEdge(from.hash(), to.hash())) {
            throw new Error(`No path exists between ${from} and ${to}.`);
        }

        return this._distance(from, to);
    }

    public distanceIfPossible(from: Position, to: Position): number | null {
        if (!this._graph.hasUndirectedEdge(from.hash(), to.hash())) {
            return null;
        }

        return this._distance(from, to);
    }

    public isReachable(from: Position, to: Position): boolean {
        return this._graph.hasUndirectedEdge(from.hash(), to.hash());
    }

    /**
     * Returns the length of the shortest path between the given position and the closest delivery position.
     *
     * @param position The position to find the closest delivery position for.
     *
     * @returns The length of the shortest path between the given position and the closest delivery position.
     */
    public distanceToDelivery(position: Position): number {
        return this._distance(position, this.getClosestDeliveryPosition(position));
    }

    /**
     * Returns the positions adjacent to the given position.
     *
     * @param position The position to find adjacent tiles for.
     *
     * @returns The adjacent positions.
     */
    public adjacent(position: Position): Position[] {
        return position
            .adjacent()
            .filter((adjacent) => this._graph.hasNode(adjacent.hash()))
            .map((adjacent) => this._graph.getNodeAttributes(adjacent.hash())!.position);
    }

    /**
     * Returns the next position in the path from the `from` position to the `to` position.
     * If the two positions are the same, the `from` position is returned.
     * If there is no path between the two positions, an empty array is returned.
     * If there are multiple paths between the two positions, all possible positions are returned.7
     *
     * @param from The starting position.
     * @param to The ending position.
     *
     * @returns The next position in the path from the `from` position to the `to` position.
     */
    public getNextPosition(from: Position, to: Position): Position[] {
        if (!this._graph.hasUndirectedEdge(from.hash(), to.hash())) {
            return [];
        }

        if (from.equals(to)) {
            return [from];
        }

        const distance = this.distance(from, to);
        return this.adjacent(from).filter(
            (adjacent) => this._distance(adjacent, to) === distance - 1,
        );
    }

    /**
     * Returns the next direction to move from the `from` position to the `to` position.
     * If the two positions are the same, `Direction.NONE` is returned.
     * If there is no path between the two positions, an empty array is returned.
     * If there are multiple paths between the two positions, all possible directions are returned.
     *
     * @param from The starting position.
     * @param to The ending position.
     *
     * @returns The next direction to move from the `from` position to the `to` position.
     */
    public getNextDirection(from: Position, to: Position): Direction[] {
        return this.getNextPosition(from, to).map((position) => from.directionTo(position));
    }

    /**
     * Returns the tile at the given position.
     *
     * @param position The position to find the tile for.
     *
     * @returns The tile at the given position or `null` if no tile exists.
     */
    public getTile(position: Position): Tile | null {
        return this._graph.getNodeAttributes(position.hash());
    }

    /**
     * Returns the closest delivery position to the given position.
     *
     * @param position The position to find the closest delivery position for.
     *
     * @returns The closest delivery position.
     */
    public getClosestDeliveryPosition(position: Position): Position {
        const distances = this.deliveryTiles
            .filter((tile) => this._graph.hasUndirectedEdge(position.hash(), tile.position.hash()))
            .map((tile) => [tile, this._distance(position, tile.position)] as const);

        let minDistance = Number.POSITIVE_INFINITY;
        let closestTile: Tile | null = null;

        for (const [tile, distance] of distances) {
            if (distance < minDistance) {
                minDistance = distance;
                closestTile = tile;
            }
        }

        if (closestTile === null) {
            throw new Error(`No delivery tile exists from ${position}.`);
        }

        return closestTile.position;
    }

    /**
     * Computes the position `nsteps` steps along the path from `from` to `to`.
     * If `nsteps` is greater than the length of the path, the final position is returned.
     *
     * @param from The starting position.
     * @param to The ending position.
     * @param nsteps The number of steps to take along the path.
     */
    public computePosition(from: Position, to: Position, nsteps: number): Position {
        const distance = this.distance(from, to);
        if (nsteps >= distance) {
            return to;
        }

        let current = from;
        for (let i = 0; i < nsteps; i += 1) {
            const next = this.adjacent(current).find(
                (adj) => this._distance(adj, to) === distance - i - 1,
            )!;
            current = next;
        }

        return current;
    }

    // ---------------------------------------------------------------------------
    // Private methods
    // ---------------------------------------------------------------------------

    private _distance(from: Position, to: Position): number {
        return this._graph.getEdgeAttribute(from.hash(), to.hash(), "weight");
    }
}
