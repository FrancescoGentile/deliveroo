//
//
//

import { Environment } from "src/domain/environment";
import { Config, Intention, Position, Utility } from "src/domain/structs";
import { Instant } from "src/utils";
import { MCTSNotStartedError } from "../errors";
import { Node, State } from "./node";

/**
 * The Monte Carlo Tree Search algorithm.
 */
export class MonteCarloTreeSearch {
    private _root: Node | null = null;

    private readonly _enviroment: Environment;

    public constructor(enviroment: Environment) {
        this._enviroment = enviroment;
    }

    // -----------------------------------------------------------------------
    // Public methods
    // -----------------------------------------------------------------------

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
    }

    /**
     * Computes the utilities of the intentions that the agent can execute in the current state
     * and at the given instant.
     *
     * @param instant The instant at which the utilities should be computed. If not specified,
     * the current instant is used.
     *
     * @returns An array of intention-utility pairs.
     */
    public computeIntentionUtilities(instant?: Instant): [Intention, number][] {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        const position = this._root.state.position;
        const now = instant ?? Instant.now();
        const { movementDuration } = Config.getEnvironmentConfig();

        return this._root.children.map((child) => {
            const distance = this._enviroment.map.distance(position, child.state.position);
            const arrivalInstant = now.add(movementDuration.multiply(distance));
            const utility = child.utility.getValueByInstant(arrivalInstant);

            return [child.state.executedIntenion, utility];
        });
    }
}
