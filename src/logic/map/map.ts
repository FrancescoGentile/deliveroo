//
//
//

import { Position, Tile } from 'src/logic/structs';
import { Graph, buildGraph } from './graph';

export class GraphMap {
  private constructor(private readonly _graph: Graph, private readonly _deliveryTiles: Tile[]) {}

  /**
   * Creates a new graph from the given tiles.
   * @param tiles The tiles in the environment that are walkable.
   * @returns A new graph.
   */
  public static async new(tiles: Tile[]): Promise<GraphMap> {
    const graph = await buildGraph(tiles);
    const deliveryTiles = tiles.filter((tile) => tile.delivery);

    return new GraphMap(graph, deliveryTiles);
  }

  /**
   * Returns the length of the shortest path between the two positions.
   * @param from The starting position.
   * @param to The ending position.
   * @returns The length of the shortest path between the two positions or
   * `null` if no path exists.
   */
  public distance(from: Position, to: Position): number {
    if (!this._graph.hasEdge(from.hash(), to.hash())) {
      throw new Error(`No path exists between ${from} and ${to}.`);
    }

    return this._graph.getEdgeAttribute(from.hash(), to.hash(), 'weight');
  }

  /**
   * Returns the positions adjacent to the given position.
   * @param position The position to find adjacent tiles for.
   * @returns The adjacent positions.
   */
  public adjacent(position: Position): Position[] {
    return position
      .adjacent()
      .filter((adjacent) => this._graph.hasNode(adjacent.hash()))
      .map((adjacent) => this._graph.getNodeAttributes(adjacent.hash())!.position);
  }

  /**
   * Returns the tile at the given position.
   * @param position The position to find the tile for.
   * @returns The tile at the given position or `null` if no tile exists.
   */
  public getTile(position: Position): Tile | null {
    return this._graph.getNodeAttributes(position.hash());
  }

  /**
   * Returns the tiles that are reachable from the given position.
   * @param position The position to find reachable tiles for.
   * @returns The reachable tiles.
   */
  public getReachableDeliveryTiles(position: Position): Tile[] {
    return this._deliveryTiles.filter((tile) =>
      this._graph.hasEdge(position.hash(), tile.position.hash())
    );
  }
}
