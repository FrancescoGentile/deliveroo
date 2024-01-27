//
//
//

import { BeliefSet } from "src/domain/beliefs";
import {
    Config,
    DecayingValue,
    Intention,
    IntentionType,
    Parcel,
    ParcelID,
    Position,
    Utility,
} from "src/domain/structs";
import { Instant } from "src/utils";
import treefy from "treeify";
import { MCTSNotStartedError } from "../errors";
import { Node, State } from "./node";

/**
 * The Monte Carlo Tree Search algorithm.
 */
export class MonteCarloTreeSearch {
    private _root: Node | null = null;

    private readonly _beliefs: BeliefSet;

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    public constructor(enviroment: BeliefSet) {
        this._beliefs = enviroment;

        this._beliefs.onParcelsChange(this._onParcelsChange.bind(this));
        this._beliefs.onExpiredParcels(this._onExpiredParcels.bind(this));
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

        this._root = new Node(state, this._beliefs.getParcelPositions(), this._beliefs);

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

    public addAllPutdownIntentions() {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        const alreadyAdded = new Set<Intention>();
        for (const intention of this._root.nextIntentions) {
            if (intention.type === IntentionType.PUTDOWN) {
                alreadyAdded.add(intention);
            }
        }

        const newIntentions: Intention[] = [];
        for (const delivery of this._beliefs.map.deliveryTiles) {
            const intention = Intention.putdown(delivery.position);
            if (!alreadyAdded.has(intention)) {
                newIntentions.push(intention);
            }
        }

        this._root.addIntentions(newIntentions);
    }

    public removeCarryingParcels(): ParcelID[] {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        const parcels = this._root.state.pickedParcels;
        for (const [id, parcel] of parcels) {
            this._root.partialRemoveParcel(id, parcel);
        }

        return parcels.map(([id]) => id);
    }

    public printTree(instant: Instant, position: Position) {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        console.log("Tree:");
        console.log(
            treefy.asTree(this._getTree(this._root.children, instant, position), true, false),
        );
    }

    // ------------------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------------------

    private _onParcelsChange(
        newFreeParcels: ParcelID[],
        changedPositionParcels: [ParcelID, Position, Position][],
        noLongerFreeParcels: [ParcelID, Position, DecayingValue][],
    ) {
        if (this._root === null) {
            return;
        }

        if (noLongerFreeParcels.length > 0) {
            for (const [id, pos, value] of noLongerFreeParcels) {
                this._root.removeNoLongerFreeParcel(id, pos, value);
            }
        }

        if (changedPositionParcels.length > 0) {
            for (const [id, oldPos, newPos] of changedPositionParcels) {
                const value = this._beliefs.getParcelByID(id)!.value;
                this._root.removeNoLongerFreeParcel(id, oldPos, value);
                newFreeParcels.push(id);
            }
        }

        if (newFreeParcels.length > 0) {
            this._root.addNewFreeParcels(newFreeParcels);
        }
    }

    private _onExpiredParcels(parcels: [ParcelID, Position, DecayingValue][]) {
        if (this._root === null) {
            return;
        }

        for (const [id, pos, value] of parcels) {
            this._root.removeExpiredParcel(id, pos, value);
        }
    }

    private _getTree(children: Node[], startTime: Instant, position: Position): any {
        const res: any = {};
        for (const [idx, node] of children.entries()) {
            const distance = this._beliefs.map.distance(
                position,
                node.state.executedIntenion.position,
            );
            const { movementDuration } = Config.getEnvironmentConfig();
            const arrivalTime = startTime.add(movementDuration.multiply(distance));

            const parcels = Array.from(node.utility.parcels.keys());
            res[`child_${idx}`] = {
                intention: node.state.executedIntenion,
                visits: node.visits,
                utility_parcels: parcels,
                score: node.utility.getValueByInstant(arrivalTime) / node.visits,
                ...this._getTree(node.children, arrivalTime, node.state.executedIntenion.position),
            };
        }

        return res;
    }
}
