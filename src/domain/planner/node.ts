//
//
//

import { Config, Intention, IntentionType, Parcel, Position, Utility } from "src/domain/structs";
import { Instant } from "src/utils";
import { Environment } from "../environment";
import { UnsupportedIntentionTypeError } from "../errors";

export interface State {
    readonly executedIntenion: Intention;
    position: Position;
    readonly pickedParcels: Parcel[];
    readonly arrivalInstant: Instant;
}

/**
 * Represents a node in the MCTS tree.
 */
export class Node {
    public parent: Node | null;

    public readonly children: Node[] = [];

    public readonly nextIntentions: Intention[];

    public readonly state: State;

    public readonly environment: Environment;

    public readonly utility: Utility;

    public _reward = 0;

    private _visits = 0;
    public get visits(): number {
        return this._visits;
    }

    public constructor(
        state: State,
        availablePositions: Position[],
        environment: Environment,
        parent: Node | null = null,
    ) {
        this.state = state;
        this.environment = environment;
        this.parent = parent;

        this.utility = new Utility(0, [], state.arrivalInstant);

        this.nextIntentions = availablePositions.map((pos) => Intention.pickup(pos));

        switch (state.executedIntenion.type) {
            case IntentionType.PICKUP: {
                const closestDelivery = this.environment.map.getClosestDeliveryPosition(
                    state.position,
                );
                this.nextIntentions.push(Intention.putdown(closestDelivery));
                break;
            }
            case IntentionType.PUTDOWN: {
                for (const parcel of state.pickedParcels) {
                    this._reward += parcel.value.getValueByInstant(state.arrivalInstant);
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

    public isFullyExpanded(): boolean {
        return this.children.length === this.nextIntentions.length;
    }

    public isTerminal(): boolean {
        return this.nextIntentions.length === 0;
    }

    public selectChild(): Node {
        if (this.isTerminal()) {
            throw new Error("Cannot select child of a terminal node.");
        }

        if (!this.isFullyExpanded()) {
            return this.expand();
        }

        return this._getBestChild();
    }

    public expand(): Node {
        const idx = this.children.length;
        const nextIntention = this.nextIntentions[idx];

        const availablePositions = this.nextIntentions
            .filter((intention, i) => i !== idx && intention.type === IntentionType.PICKUP)
            .map((intention) => intention.position);

        let pickedParcels: Parcel[];

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
                    ...this.environment.getParcelsByPosition(nextIntention.position),
                );

                break;
            }
            default: {
                throw new UnsupportedIntentionTypeError(nextIntention);
            }
        }

        const distance = this.environment.map.distance(this.state.position, nextIntention.position);
        const { movementDuration } = Config.getEnvironmentConfig();
        const arrivalTime = this.state.arrivalInstant.add(movementDuration.multiply(distance));

        const state: State = {
            executedIntenion: nextIntention,
            position: nextIntention.position,
            pickedParcels,
            arrivalInstant: arrivalTime,
        };

        const node = new Node(state, availablePositions, this.environment, this);
        this.children.push(node);

        return node;
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
        const closestDelivery = this.environment.map.getClosestDeliveryPosition(
            this.state.position,
        );
        const { movementDuration } = Config.getEnvironmentConfig();
        const distance = this.environment.map.distance(this.state.position, closestDelivery);
        const arrivalTime = this.state.arrivalInstant.add(movementDuration.multiply(distance));

        let upperBound = Number.EPSILON;
        for (const parcel of this.state.pickedParcels) {
            upperBound += parcel.value.getValueByInstant(arrivalTime);
        }

        for (const intention of this.nextIntentions) {
            if (intention.type === IntentionType.PICKUP) {
                for (const parcel of this.environment.getParcelsByPosition(intention.position)) {
                    upperBound += parcel.value.getValueByInstant(arrivalTime);
                }
            }
        }

        return upperBound;
    }

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

    private _computeGreedyValue(intention: Intention): number {
        switch (intention.type) {
            case IntentionType.PICKUP: {
                const pickupPosition = intention.position;
                const deliveryPosition =
                    this.environment.map.getClosestDeliveryPosition(pickupPosition);
                const distance =
                    this.environment.map.distance(this.state.position, pickupPosition) +
                    this.environment.map.distance(pickupPosition, deliveryPosition);

                const { movementDuration } = Config.getEnvironmentConfig();
                const arrivalTime = this.state.arrivalInstant.add(
                    movementDuration.multiply(distance),
                );

                let value = 0;
                for (const parcel of this.state.pickedParcels) {
                    value += parcel.value.getValueByInstant(arrivalTime);
                }

                for (const parcel of this.environment.getParcelsByPosition(pickupPosition)) {
                    value += parcel.value.getValueByInstant(arrivalTime);
                }

                return value;
            }
            case IntentionType.PUTDOWN: {
                const distance = this.environment.map.distance(
                    this.state.position,
                    intention.position,
                );
                const { movementDuration } = Config.getEnvironmentConfig();
                const arrivalTime = this.state.arrivalInstant.add(
                    movementDuration.multiply(distance),
                );

                let value = 0;
                for (const parcel of this.state.pickedParcels) {
                    value += parcel.value.getValueByInstant(arrivalTime);
                }

                return value;
            }
            default: {
                throw new UnsupportedIntentionTypeError(intention);
            }
        }
    }
}
