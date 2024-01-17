//
//
//

import { Environment } from "src/domain/environment";
import { Config, Intention, ParcelID, Position, Utility } from "src/domain/structs";
import { Instant } from "src/utils";
import { MCTSNotStartedError } from "../errors";
import { Node, State } from "./node";

/**
 * The Monte Carlo Tree Search algorithm.
 */
export class MonteCarloTreeSearch {
    private _root: Node | null = null;

    private readonly _enviroment: Environment;

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    public constructor(enviroment: Environment) {
        this._enviroment = enviroment;

        this._enviroment.onParcelsChange(this._onParcelsChange.bind(this));
    }

    // ------------------------------------------------------------------------
    // Public methods
    // ------------------------------------------------------------------------

    /**
     * Starts the MCTS algorithm.
     * To stop the algorithm, call stop().
     *
     * @param position The current position of the agent.
     *
     * @throws {Error} If the MCTS algorithm is already started.
     */
    public async start(position: Position) {
        if (this._root !== null) {
            throw new Error("MCTS already started. If you want to restart it, call stop() first.");
        }

        // we create a fake state to start the search
        const state: State = {
            executedIntenion: Intention.putdown(position),
            position,
            arrivalInstant: Instant.now(),
            pickedParcels: [],
        };

        this._root = new Node(state, this._enviroment.getParcelPositions(), this._enviroment);

        while (this._root !== null) {
            this.runIteration();
            // to avoid blocking the event loop, we run the iterations in the next tick
            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    /**
     * Runs a single iteration of the MCTS algorithm.
     */
    public runIteration() {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        let node = this._root;
        while (!node.isTerminal()) {
            node = node.selectChild();
        }

        node.backtrack(new Utility(0, [], node.state.arrivalInstant));
    }

    /**
     * Stops the MCTS algorithm.
     */
    public stop() {
        this._root = null;
    }

    /**
     * Updates the current position of the agent.
     *
     * @param position The new position of the agent.
     */
    public updatePosition(position: Position) {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        this._root.state.arrivalInstant = Instant.now();
        this._root.state.position = position;
    }

    /**
     * Executes an intention.
     * This method should be called when the agent executes an intention to update the tree
     * by setting the subtree of the executed intention as the new root.
     *
     * @param intention The intention that was executed.
     *
     * @throws {Error} If no subtree with the given intention is found.
     */
    public executeIntention(intention: Intention) {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        const child = this._root.children.find((child) =>
            child.state.executedIntenion.equals(intention),
        );
        if (child === undefined) {
            throw new Error("Intention not found.");
        }

        this._root = child;
        this._root.parent = null;
        this._root.state.arrivalInstant = Instant.now();
    }

    /**
     * Returns the utilities of the intentions that the agent can execute in the current state.
     *
     * @returns An array of intention-utility-visits tuples.
     */
    public getIntentionUtilities(): [Intention, Utility, number][] {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        return this._root.children.map((child) => [
            child.state.executedIntenion,
            child.utility,
            child.visits,
        ]);
    }

    // ------------------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------------------

    private _onParcelsChange(
        newFreeParcels: ParcelID[],
        changedPositionParcels: [ParcelID, Position, Position][],
        noLongerFreeParcels: [ParcelID, Position][],
    ) {
        if (this._root === null) {
            return;
        }

        // For now, if there is a change in the parcels, we restart the search.
        // TODO: find a way to update the tree without restarting the search.
        const state: State = {
            executedIntenion: Intention.pickup(this._root.state.position),
            position: this._root.state.position,
            arrivalInstant: Instant.now(),
            pickedParcels: this._root.state.pickedParcels,
        };

        this._root = new Node(state, this._enviroment.getParcelPositions(), this._enviroment);
    }
}
