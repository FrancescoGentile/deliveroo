//
//
//

import { BeliefSet } from "src/domain/beliefs";
import {
    DecayingValue,
    Intention,
    IntentionType,
    Parcel,
    ParcelID,
    Position,
    Utility,
} from "src/domain/structs";
import { HashMap, Instant } from "src/utils";
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

    public getCarryingParcels(): ParcelID[] {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        return this._root.state.pickedParcels.map(([id]) => id);
    }

    public removeCarryingParcels(): ParcelID[] {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        const parcels = [...this._root.state.pickedParcels];
        const parcelPositions = new HashMap<Position, [ParcelID, DecayingValue][]>();
        parcelPositions.set(this._root.state.executedIntenion.position, parcels);

        this._root.removeParcels(parcelPositions);
        if (this._root.state.pickedParcels.length > 0) {
            throw new Error("Could not remove all parcels.");
        }

        return parcels.map(([id]) => id);
    }

    public printTree(instant: Instant, position: Position) {
        if (this._root === null) {
            throw new MCTSNotStartedError();
        }

        console.log("Tree:");
        console.log(treefy.asTree(this._getTree(this._root.children), true, false));
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

        const removeParcelPositions = new HashMap<Position, [ParcelID, DecayingValue][]>();
        const addParcelPositions = new HashMap<Position, Parcel[]>();

        for (const id of newFreeParcels) {
            const parcel = this._beliefs.getParcelByID(id)!;
            if (!addParcelPositions.has(parcel.position)) {
                addParcelPositions.set(parcel.position, []);
            }

            addParcelPositions.get(parcel.position)!.push(parcel);
        }

        for (const [id, oldPos, newPos] of changedPositionParcels) {
            if (!removeParcelPositions.has(oldPos)) {
                removeParcelPositions.set(oldPos, []);
            }

            if (!addParcelPositions.has(newPos)) {
                addParcelPositions.set(newPos, []);
            }

            const parcel = this._beliefs.getParcelByID(id)!;
            removeParcelPositions.get(oldPos)!.push([id, parcel.value]);
            addParcelPositions.get(newPos)!.push(parcel);
        }

        for (const [id, pos, value] of noLongerFreeParcels) {
            if (!removeParcelPositions.has(pos)) {
                removeParcelPositions.set(pos, []);
            }

            removeParcelPositions.get(pos)!.push([id, value]);
        }

        if (removeParcelPositions.size > 0) {
            this._root.removeParcels(removeParcelPositions);
        }
        if (addParcelPositions.size > 0) {
            this._root.addNewFreeParcels(addParcelPositions);
        }
    }

    private _onExpiredParcels(parcels: [ParcelID, Position, DecayingValue][]) {
        if (this._root === null) {
            return;
        }

        const removeParcelPositions = new HashMap<Position, [ParcelID, DecayingValue][]>();
        for (const [id, pos, value] of parcels) {
            if (!removeParcelPositions.has(pos)) {
                removeParcelPositions.set(pos, []);
            }

            removeParcelPositions.get(pos)!.push([id, value]);
        }

        this._root.removeParcels(removeParcelPositions);
    }

    private _getTree(children: Node[]): any {
        const res: any = {};
        for (const [idx, node] of children.entries()) {
            res[`child_${idx}`] = {
                intention: node.state.executedIntenion,
                utility: node.utility.value,
                visits: node.visits,
                utility_parcels: Array.from(node.utility.parcels.keys()),
                ...this._getTree(node.children),
            };
        }

        return res;
    }
}
