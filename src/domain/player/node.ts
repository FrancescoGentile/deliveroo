//
//
//

import {
    Config,
    Intention,
    IntentionType,
    Parcel,
    Position,
    Utility,
} from "src/domain/structs";
import { State, greedySortIntentions } from "./utils";

export class Node {
    public readonly utility: Utility;

    public readonly intention: Intention;

    public parent: Node | null;

    private readonly _state: State;

    public readonly nextIntentions: Intention[];

    private readonly _children: Node[] = [];

    private _visits: number;

    private readonly _reward: number;

    public get visits(): number {
        return this._visits;
    }

    public get children(): Node[] {
        return this._children;
    }

    public get state(): State {
        return this._state;
    }

    public constructor(
        state: State,
        intention: Intention,
        parent: Node | null,
    ) {
        this.utility = new Utility(0, [], state.arrivalTime);
        this.intention = intention;
        this.parent = parent;
        this._visits = 0;
        this._reward = 0;
        this._state = state;

        if (intention.type === IntentionType.PUTDOWN) {
            for (const parcel of state.pickedParcels) {
                this._reward += parcel.value.getValueByInstant(
                    state.arrivalTime,
                );
            }
        }

        const intentions = state.availablePositions.map((position) =>
            Intention.pickup(position),
        );
        if (intention.type !== IntentionType.PUTDOWN) {
            const delivery = state.environment.getClosestDeliveryPosition(
                intention.position,
            );
            intentions.push(Intention.putdown(delivery));
        }

        this.nextIntentions = greedySortIntentions(
            intentions,
            this._state.pickedParcels,
            this.intention.position,
            this._state.arrivalTime,
            this._state.environment,
        );
    }

    public isFullyExpanded(): boolean {
        return this.nextIntentions.length === this._children.length;
    }

    public isTerminal(): boolean {
        return this.nextIntentions.length === 0;
    }

    public selectChild(): Node {
        if (!this.isFullyExpanded()) {
            return this.expand();
        }

        return this.getBestChild();
    }

    public expand(): Node {
        const idx = this._children.length;
        const nextIntention = this.nextIntentions[idx];

        let availablePositions: Position[];
        let pickedParcels: Parcel[];

        if (nextIntention.type === IntentionType.PUTDOWN) {
            availablePositions = this._state.availablePositions;
            pickedParcels = this._state.pickedParcels;
        } else {
            availablePositions = this._state.availablePositions.filter(
                (position) => !position.equals(nextIntention.position),
            );

            if (this.intention.type === IntentionType.PUTDOWN) {
                pickedParcels = [];
            } else {
                pickedParcels = [...this._state.pickedParcels];
            }
            pickedParcels.push(
                ...this._state.environment.getParcelsByPosition(
                    nextIntention.position,
                ),
            );
        }

        const distance = this._state.environment.distance(
            this.intention.position,
            nextIntention.position,
        );
        const { movementDuration } = Config.getInstance();
        const arrivalTime = this._state.arrivalTime.add(
            movementDuration.multiply(distance),
        );

        const state = {
            availablePositions,
            pickedParcels,
            arrivalTime,
            environment: this._state.environment,
        };

        const node = new Node(state, nextIntention, this);
        this._children.push(node);

        return node;
    }

    private getBestChild(explorationParameter: number = Math.sqrt(2)): Node {
        let upperBound = Number.EPSILON;

        for (const parcel of this._state.pickedParcels) {
            upperBound += parcel.value.getValueByInstant(
                this.state.arrivalTime,
            );
        }

        for (const intention of this.nextIntentions) {
            if (intention.type === IntentionType.PUTDOWN) {
                continue;
            }

            for (const parcel of this._state.environment.getParcelsByPosition(
                intention.position,
            )) {
                upperBound += parcel.value.getValueByInstant(
                    this.state.arrivalTime,
                );
            }
        }

        let bestChild = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const child of this._children.values()) {
            const exploitation =
                child.utility.getValueByInstant(child.state.arrivalTime) /
                child._visits /
                upperBound;
            const exploration = Math.sqrt(
                Math.log(this._visits) / child.visits,
            );
            const score = exploitation + explorationParameter * exploration;

            if (score > bestScore) {
                bestChild = child;
                bestScore = score;
            }
        }

        if (bestChild === null) {
            if (this._children.length === 0) {
                throw new Error("No children");
            }

            throw new Error("Best child is null");
        }

        return bestChild;
    }

    public backpropagate(utility: Utility) {
        let toBePassed: Utility;

        if (this.intention.type === IntentionType.PUTDOWN) {
            const tmp = utility.newWith(
                this._reward,
                this.state.pickedParcels,
                this.state.arrivalTime,
            );

            this.utility.add(tmp);
            toBePassed = tmp;
        } else {
            this.utility.add(utility);
            toBePassed = utility;
        }

        this._visits += 1;

        if (this.parent !== null) {
            this.parent.backpropagate(toBePassed);
        }
    }
}
