//
//
//

import { BeliefSet } from "src/domain/beliefs";
import {
    Config,
    DecayingValue,
    Intention,
    IntentionType,
    ParcelID,
    Position,
    Utility,
} from "src/domain/structs";
import { Instant } from "src/utils";
import { UnsupportedIntentionTypeError } from "../errors";

export interface State {
    readonly executedIntenion: Intention;
    position: Position;
    arrivalInstant: Instant;
    readonly pickedParcels: [ParcelID, DecayingValue][];
}

/**
 * Represents a node in the MCTS tree.
 */
export class Node {
    public parent: Node | null;

    public readonly children: Node[] = [];

    public readonly nextIntentions: Intention[];

    public readonly state: State;

    public readonly beliefs: BeliefSet;

    public readonly utility: Utility;

    public _reward = 0;

    private _visits = 0;
    public get visits(): number {
        return this._visits;
    }

    public constructor(
        state: State,
        availablePositions: Position[],
        environment: BeliefSet,
        parent: Node | null = null,
    ) {
        this.state = state;
        this.beliefs = environment;
        this.parent = parent;

        this.utility = new Utility(0, [], state.arrivalInstant);

        this.nextIntentions = availablePositions.map((pos) => Intention.pickup(pos));

        switch (state.executedIntenion.type) {
            case IntentionType.PICKUP: {
                const closestDelivery = this.beliefs.map.getClosestDeliveryPosition(state.position);
                this.nextIntentions.push(Intention.putdown(closestDelivery));
                break;
            }
            case IntentionType.PUTDOWN: {
                for (const [, value] of state.pickedParcels) {
                    this._reward += value.getValueByInstant(state.arrivalInstant);
                }
                break;
            }
            default: {
                throw new UnsupportedIntentionTypeError(state.executedIntenion);
            }
        }

        this._sortIntentions();
    }

    // -----------------------------------------------------------------------
    // Public methods
    // -----------------------------------------------------------------------

    /**
     * Returns true if the node is fully expanded.
     *
     * @returns true if the node is fully expanded.
     */
    public isFullyExpanded(): boolean {
        return this.children.length === this.nextIntentions.length;
    }

    /**
     * Returns true if the node is terminal, i.e. if it cannot have any child.
     *
     * @returns true if the node is terminal.
     */
    public isTerminal(): boolean {
        return this.nextIntentions.length === 0;
    }

    /**
     * Selects a child of the node.
     * If the node is not fully expanded, it expands it and returns the new child.
     * If the node is fully expanded, it returns the best child according to the UCT formula.
     *
     * @returns the selected child.
     *
     * @throws {Error} If the node is terminal.
     */
    public selectChild(): Node {
        if (this.isTerminal()) {
            throw new Error("Cannot select child of a terminal node.");
        }

        if (!this.isFullyExpanded()) {
            return this._expand();
        }

        return this._getBestChild();
    }

    public backtrack(utility: Utility) {
        this._visits += 1;

        let toBePassed: Utility;
        if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
            const tmp = utility.newWith(
                this._reward,
                this.state.pickedParcels,
                this.state.arrivalInstant,
            );

            this.utility.add(tmp);
            toBePassed = tmp;
        } else {
            this.utility.add(utility);
            toBePassed = utility;
        }

        if (this.parent !== null) {
            this.parent.backtrack(toBePassed);
        }
    }

    // -----------------------------------------------------------------------
    // Private methods
    // -----------------------------------------------------------------------

    /**
     * Expands the node by adding a new child.
     *
     * @returns the new child.
     */
    private _expand(): Node {
        const idx = this.children.length;
        const nextIntention = this.nextIntentions[idx];

        const availablePositions = this.nextIntentions
            .filter((intention, i) => i !== idx && intention.type === IntentionType.PICKUP)
            .map((intention) => intention.position);

        let pickedParcels: [ParcelID, DecayingValue][];

        switch (nextIntention.type) {
            case IntentionType.PUTDOWN: {
                pickedParcels = this.state.pickedParcels;
                break;
            }
            case IntentionType.PICKUP: {
                if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
                    pickedParcels = [];
                } else {
                    pickedParcels = [...this.state.pickedParcels];
                }

                pickedParcels.push(
                    ...this.beliefs
                        .getParcelsByPosition(nextIntention.position)
                        .map((p) => [p.id, p.value] as [ParcelID, DecayingValue]),
                );

                break;
            }
            default: {
                throw new UnsupportedIntentionTypeError(nextIntention);
            }
        }

        const distance = this.beliefs.map.distance(this.state.position, nextIntention.position);
        const { movementDuration } = Config.getEnvironmentConfig();
        const arrivalTime = this.state.arrivalInstant.add(movementDuration.multiply(distance));

        const state: State = {
            executedIntenion: nextIntention,
            position: nextIntention.position,
            pickedParcels,
            arrivalInstant: arrivalTime,
        };

        const node = new Node(state, availablePositions, this.beliefs, this);
        this.children.push(node);

        return node;
    }

    /**
     * Returns the best child of the node according to the UCT formula.
     *
     * @param explorationParameter The exploration parameter to use in the UCT formula.
     *
     * @returns the best child of the node.
     */
    private _getBestChild(explorationParameter: number = Math.sqrt(2)): Node {
        if (this.children.length === 0) {
            throw new Error("Cannot get best child of a node without children.");
        }

        const upperBound = this._computeUpperBound();

        let bestChild = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const child of this.children) {
            const utility = child.utility.getValueByInstant(child.state.arrivalInstant);
            const exploitation = utility / child.visits / upperBound;

            const exploration = Math.sqrt(Math.log(this.visits) / child.visits);

            const score = exploitation + explorationParameter * exploration;
            if (score > bestScore) {
                bestScore = score;
                bestChild = child;
            }
        }

        if (bestChild === null) {
            // This should never happen.
            throw new Error("No best child found.");
        }

        return bestChild;
    }

    /**
     * Computes the upper bound of the value of the node.
     * The upper bound corresponds to the reward obtained if the agent could instantly pick up
     * all the parcels that are currently free and deliver them to the closest delivery point.
     *
     * @returns the upper bound of the value of the node.
     */
    private _computeUpperBound(): number {
        const closestDelivery = this.beliefs.map.getClosestDeliveryPosition(this.state.position);
        const { movementDuration } = Config.getEnvironmentConfig();
        const distance = this.beliefs.map.distance(this.state.position, closestDelivery);
        const arrivalTime = this.state.arrivalInstant.add(movementDuration.multiply(distance));

        let upperBound = Number.EPSILON;
        for (const [, value] of this.state.pickedParcels) {
            upperBound += value.getValueByInstant(arrivalTime);
        }

        for (const intention of this.nextIntentions) {
            if (intention.type === IntentionType.PICKUP) {
                for (const parcel of this.beliefs.getParcelsByPosition(intention.position)) {
                    upperBound += parcel.value.getValueByInstant(arrivalTime);
                }
            }
        }

        return upperBound;
    }

    /**
     * Sorts the next intentions according to their greedy value.
     *
     * @param start The index of the first intention to start sorting from.
     *
     * @throws {Error} If the intentions to sort have already been expanded.
     */
    private _sortIntentions(start = 0) {
        if (this.children.length > start) {
            throw new Error("Cannot sort intentions that have already been expanded.");
        }

        const intentionsWithValues: [Intention, number][] = this.nextIntentions
            .slice(start)
            .map((intention) => [intention, this._computeGreedyValue(intention)]);

        intentionsWithValues.sort((a, b) => b[1] - a[1]);

        for (let i = start; i < this.nextIntentions.length; i++) {
            this.nextIntentions[i] = intentionsWithValues[i - start][0];
        }
    }

    /**
     * Computes the greedy value of the given intention.
     * The greedy value of a pickup intention is the utility that the agent would obtain if it
     * went pickup the parcels at the given position and then deliver them (and the parcels it is
     * already carrying) to the closest delivery point.
     * The greedy value of a putdown intention is the utility that the agent would obtain if it
     * went to the given position and then delivered all the parcels it is currently carrying.
     *
     * @param intention The intention to compute the greedy value of.
     *
     * @returns the greedy value of the given intention.
     *
     * @throws {UnsupportedIntentionTypeError} If the given intention is not a pickup or a putdown
     * intention.
     */
    private _computeGreedyValue(intention: Intention): number {
        switch (intention.type) {
            case IntentionType.PICKUP: {
                const pickupPosition = intention.position;
                const deliveryPosition =
                    this.beliefs.map.getClosestDeliveryPosition(pickupPosition);
                const distance =
                    this.beliefs.map.distance(this.state.position, pickupPosition) +
                    this.beliefs.map.distance(pickupPosition, deliveryPosition);

                const { movementDuration } = Config.getEnvironmentConfig();
                const arrivalTime = this.state.arrivalInstant.add(
                    movementDuration.multiply(distance),
                );

                let value = 0;
                for (const [, parcelValue] of this.state.pickedParcels) {
                    value += parcelValue.getValueByInstant(arrivalTime);
                }

                for (const parcel of this.beliefs.getParcelsByPosition(pickupPosition)) {
                    value += parcel.value.getValueByInstant(arrivalTime);
                }

                return value;
            }
            case IntentionType.PUTDOWN: {
                const distance = this.beliefs.map.distance(this.state.position, intention.position);
                const { movementDuration } = Config.getEnvironmentConfig();
                const arrivalTime = this.state.arrivalInstant.add(
                    movementDuration.multiply(distance),
                );

                let value = 0;
                for (const [, parcelValue] of this.state.pickedParcels) {
                    value += parcelValue.getValueByInstant(arrivalTime);
                }

                return value;
            }
            default: {
                throw new UnsupportedIntentionTypeError(intention);
            }
        }
    }
}
