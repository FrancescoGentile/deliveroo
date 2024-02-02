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
import { HashMap, HashSet, Instant } from "src/utils";
import { UnsupportedIntentionTypeError } from "../errors";

export interface State {
    readonly executedIntenion: Intention;
    position: Position;
    arrivalInstant: Instant;
    pickedParcels: [ParcelID, DecayingValue][];
}

/**
 * Represents a node in the MCTS tree.
 */
export class Node {
    public parent: Node | null;

    public readonly children: Node[] = [];

    public readonly nextIntentions: Intention[] = [];

    public readonly state: State;

    public readonly beliefs: BeliefSet;

    public utility: Utility;

    private _visits = 0;
    public get visits(): number {
        return this._visits;
    }

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    public constructor(
        state: State,
        availablePositions: Position[],
        environment: BeliefSet,
        parent: Node | null = null,
    ) {
        this.state = state;
        this.beliefs = environment;
        this.parent = parent;

        const nextIntentions = availablePositions.map((pos) => Intention.pickup(pos));

        if (state.executedIntenion.type === IntentionType.PICKUP) {
            // If I just executed a pickup intention, I can also add to the possible next intentions
            // a putdown intention to the closest delivery point.
            const closestDelivery = this.beliefs.map.getClosestDeliveryPosition(state.position);
            nextIntentions.push(Intention.putdown(closestDelivery));
        }

        this.addIntentions(nextIntentions);
        this.utility = this._computeUtility();
    }

    // ------------------------------------------------------------------------
    // Public methods
    // ------------------------------------------------------------------------

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

        const newUtility = this._computeUtilityFromChild(utility);
        if (newUtility.value > this.utility.value) {
            this.utility = newUtility;
        }

        if (this.parent !== null) {
            this.parent.backtrack(this.utility);
        }
    }

    /**
     * Adds the given intentions to the set of possible next intentions
     * and sorts them according to their greedy value.
     *
     * @param intentions The intentions to add.
     */
    public addIntentions(intentions: Intention[]) {
        this.nextIntentions.push(...intentions);
        this._sortIntentions();
    }

    // /**
    //  * Adds the positions of the given parcels to the set of positions where the agent can go
    //  * pickup parcels.
    //  *
    //  * @param parcels The ids of the parcels to add.
    //  */
    // public addNewFreeParcels(parcels: ParcelID[]) {
    //     const positionToIdx = new Map<Position, number>();
    //     for (const [i, intention] of this.nextIntentions.entries()) {
    //         if (intention.type === IntentionType.PICKUP) {
    //             positionToIdx.set(intention.position, i);
    //         }
    //     }

    //     // if two parcels are in the same position, do not add different pickup intentions
    //     // for each parcel
    //     const newPositionsAdded = new HashSet<Position>();
    //     const newIntentions: Intention[] = [];
    //     const freeParcelsForChild: ParcelID[][] = Array(this.children.length).fill(parcels);
    //     for (const parcelID of parcels) {
    //         const parcel = this.beliefs.getParcelByID(parcelID)!;
    //         const intentionIdx = positionToIdx.get(parcel.position);
    //         if (intentionIdx !== undefined) {
    //             if (this.children.length > intentionIdx) {
    //                 const child = this.children[intentionIdx];
    //                 child._addPickupParcel(parcel);
    //                 freeParcelsForChild[intentionIdx] = freeParcelsForChild[intentionIdx].filter(
    //                     (id) => !id.equals(parcelID),
    //                 );
    //             }
    //         } else if (!newPositionsAdded.has(parcel.position)) {
    //             newIntentions.push(Intention.pickup(parcel.position));
    //             newPositionsAdded.add(parcel.position);
    //         }
    //     }

    //     this.addIntentions(newIntentions);

    //     for (let i = 0; i < this.children.length; i += 1) {
    //         if (freeParcelsForChild[i].length > 0) {
    //             this.children[i].addNewFreeParcels(freeParcelsForChild[i]);
    //         }
    //     }
    //     this._updateUtility();
    // }

    /**
     * Adds the given parcels to the set of parcels that the agent can pickup.
     *
     * @param newParcelPositions The positions of the new parcels.
     * @param newPickedParcels The new parcels that the agent has picked.
     */
    public addNewFreeParcels(
        newParcelPositions: HashMap<Position, Parcel[]>,
        newPickedParcels?: Parcel[],
    ) {
        const newIntentions: Intention[] = [];
        let newParcels = newParcelPositions;
        let addParcels = newPickedParcels ?? [];

        if (newParcels.has(this.state.executedIntenion.position)) {
            if (this.parent !== null) {
                // I am not the root, so it means that I have not yet executed the intention,
                // so I can still add the parcels to my picked parcels.
                addParcels = [...addParcels]; // we do not modify a parameter, so we create a local copy
                addParcels.push(...newParcels.get(this.state.executedIntenion.position)!);

                // since I have already picked such parcels, we do not pass to my children
                // this position
                newParcels = newParcels.copy();
                newParcels.delete(this.state.executedIntenion.position);
            }
        }

        this.state.pickedParcels.push(
            ...addParcels.map((p) => [p.id, p.value] as [ParcelID, DecayingValue]),
        );

        if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
            // since I have already put down all the new picked parcels,
            // these are not picked for my children
            addParcels = [];
        }

        for (const child of this.children) {
            child.addNewFreeParcels(newParcels, addParcels);
        }

        // for the positions that are not in the next intentions, we add a pickup intention
        // to that position
        const nextIntentionPositions = new HashSet<Position>(
            this.nextIntentions.map((intention) => intention.position),
        );
        for (const position of newParcels.keys()) {
            if (!nextIntentionPositions.has(position)) {
                newIntentions.push(Intention.pickup(position));
            }
        }

        this.addIntentions(newIntentions);
        this.utility = this._computeUtility();
    }

    /**
     * Removes the parcels that are no longer free from the set of parcels that the agent can pickup.
     *
     * @param parcelPositions The positions of the parcels that are no longer free.
     * @param noLongerCarried The parcels that are no longer carried by the agent.
     *
     * @returns The difference in visits of this node.
     */
    public removeParcels(
        parcelPositions: HashMap<Position, [ParcelID, DecayingValue][]>,
        noLongerCarried?: HashSet<ParcelID>,
    ): number {
        let removeParcels = noLongerCarried ?? new HashSet<ParcelID>();

        if (parcelPositions.has(this.state.executedIntenion.position)) {
            // some parcels have been removed from the position where I execute an intention
            // so I have to remove them from my picked parcels
            removeParcels = removeParcels.copy();
            removeParcels.addAll(
                parcelPositions.get(this.state.executedIntenion.position)!.map(([id]) => id),
            );
        }

        // remove the parcels from my picked parcels
        this.state.pickedParcels = this.state.pickedParcels.filter(
            ([id]) => !removeParcels.has(id),
        );

        if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
            // since I have already put down all the removed parcels,
            // these are not removed for my children
            removeParcels = new HashSet<ParcelID>();
        }

        let totalVisitDiff = 0;
        for (let i = 0; i < this.nextIntentions.length; i += 1) {
            const intention = this.nextIntentions[i];
            if (!parcelPositions.has(intention.position)) {
                // The intention is not a pickup intention for a position where some parcels have
                // been removed, so I do not have to remove it.
                // However, if the intention has already been expanded, the subtree rooted in the
                // child may contain some picked parcels that have been removed, so I have to
                // remove them.
                if (this.children.length > i) {
                    const child = this.children[i];
                    totalVisitDiff += child.removeParcels(parcelPositions, removeParcels);
                }
            } else {
                // The next intention is a pickup intention for a position where some parcels have been
                // removed.
                const remainingParcels = this.beliefs.getParcelsByPosition(intention.position);
                if (remainingParcels.length > 0) {
                    // In this position there are still parcels, so we can simply remove from the expanded
                    // subtree (if it exists) the parcels that have been removed.
                    if (this.children.length > i) {
                        const child = this.children[i];
                        totalVisitDiff += child.removeParcels(parcelPositions, removeParcels);
                    }
                } else {
                    // In this position there are no more parcels, so we can remove the intention and
                    // its subtree (if it exists). A better approach would be to only remove the child and
                    // append the grandchildren to the current node. For the moment, we simply remove the
                    // intention and its subtree.
                    if (this.children.length > i) {
                        totalVisitDiff -= this.children[i].visits;
                        this.children.splice(i, 1);
                    }

                    this.nextIntentions.splice(i, 1);
                    i -= 1; // we have removed an element, so we have to go back one position
                }
            }
        }

        this.utility = this._computeUtility();

        // totalVisitDiff is a negative number corresponding to the visits of the removed children
        if (totalVisitDiff > 0) {
            throw new Error("totalVisitDiff should be negative or zero.");
        }

        this._visits += totalVisitDiff;
        if (this._visits < 0) {
            // just to be sure
            throw new Error("The visits of a node cannot be negative.");
        }

        if (this._visits === 0) {
            this._visits = 1;
        }

        return totalVisitDiff;
    }

    // public removeNoLongerFreeParcel(
    //     parcelID: ParcelID,
    //     oldPosition: Position,
    //     value: DecayingValue,
    // ): number {
    //     let totalVisitDiff = 0;

    //     for (let i = 0; i < this.nextIntentions.length; i += 1) {
    //         const intention = this.nextIntentions[i];
    //         if (!intention.position.equals(oldPosition)) {
    //             if (this.children.length > i) {
    //                 const child = this.children[i];
    //                 const visitDiff = child.removeNoLongerFreeParcel(parcelID, oldPosition, value);
    //                 totalVisitDiff += visitDiff;
    //             }
    //         } else if (intention.type === IntentionType.PICKUP) {
    //             if (this.children.length > i) {
    //                 const child = this.children[i];
    //                 child.partialRemoveParcel(parcelID, value);
    //             }

    //             const parcels = this.beliefs.getParcelsByPosition(intention.position);
    //             if (parcels.length === 0) {
    //                 const visitDiff = this._removeNextIntention(i);
    //                 totalVisitDiff += visitDiff;
    //                 i -= 1;
    //             }
    //         } else {
    //             throw new UnsupportedIntentionTypeError(intention);
    //         }
    //     }

    //     this._updateUtility();
    //     return totalVisitDiff;
    // }

    // public partialRemoveParcel(parcelID: ParcelID, value: DecayingValue) {
    //     this.utility.parcels.delete(parcelID);
    //     const idx = this.state.pickedParcels.findIndex(([id]) => id.equals(parcelID));
    //     if (idx === -1) {
    //         throw new Error("This should never happen.");
    //     }
    //     this.state.pickedParcels.splice(idx, 1);

    //     if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
    //         this._reward = -value.getValueByInstant(this.state.arrivalInstant);
    //         this.utility = this.utility.newWith(this._reward);
    //     } else {
    //         for (const child of this.children) {
    //             child.partialRemoveParcel(parcelID, value);
    //         }
    //         this._updateUtility();
    //     }
    // }

    // public removeExpiredParcel(parcelID: ParcelID, oldPosition: Position, value: DecayingValue) {
    //     const isCarried = this.state.pickedParcels.some(([id]) => id.equals(parcelID));
    //     if (!isCarried) {
    //         this.removeNoLongerFreeParcel(parcelID, oldPosition, value);
    //     } else {
    //         this.partialRemoveParcel(parcelID, value);
    //     }
    // }

    // ------------------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------------------

    /**
     * Given the utility of a child node, computes the utility of the node.
     * The utility of the node is:
     * - the utility of the child node if the executed intention is a pickup intention;
     * - the utility of the child node plus the value of the parcels that the agent is carrying
     *  if the executed intention is a putdown intention.
     *
     * @param childUtility The utility of the child node.
     *
     * @returns the utility of the node.
     */
    private _computeUtilityFromChild(childUtility: Utility): Utility {
        let newUtility: Utility;
        if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
            let utilityValue = childUtility.value;
            for (const [, value] of this.state.pickedParcels) {
                utilityValue += value.getValueByInstant(this.state.arrivalInstant);
            }

            const utilityParcels = childUtility.parcels.copy();
            utilityParcels.setAll(this.state.pickedParcels);

            newUtility = new Utility(utilityValue, utilityParcels, this.state.arrivalInstant);
        } else {
            newUtility = new Utility(
                childUtility.value,
                childUtility.parcels,
                this.state.arrivalInstant,
            );
        }

        return newUtility;
    }

    /**
     * Computes the utility of the node.
     *
     * @returns the utility of the node.
     */
    private _computeUtility(): Utility {
        let bestChildUtility: Utility = Utility.zero(this.state.arrivalInstant);
        for (const child of this.children) {
            if (child.utility.value > this.utility.value) {
                bestChildUtility = child.utility;
            }
        }

        return this._computeUtilityFromChild(bestChildUtility);
    }

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
                pickedParcels = [...this.state.pickedParcels];
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

        // if (this.parent === null) {
        //     console.log("--------------------------------------------------");
        // }

        const allParcels = new Set<ParcelID>();
        for (const child of this.children) {
            for (const parcel of child.utility.parcels.keys()) {
                allParcels.add(parcel);
            }
        }

        for (const child of this.children) {
            const utility = child.utility.getValueByInstant(child.state.arrivalInstant);
            const exploitation = utility / upperBound;

            let exploration = Math.sqrt(Math.log(this.visits) / child.visits);
            for (const parcel of allParcels) {
                if (!child.utility.parcels.has(parcel)) {
                    exploration = Number.POSITIVE_INFINITY;
                    break;
                }
            }

            // const visitExploration = Math.sqrt(Math.log(this.visits) / child.visits);

            // const counts = Array.from(allParcels).map((parcel) => {
            //     const count = child.utility.parcels.get(parcel)?.[1] ?? 0;
            //     return count + 1;
            // });
            // const entropyExploration = 1 - normalized_entropy(counts);

            // if (this.parent === null) {
            //     console.log("Child: ", child.state.executedIntenion);
            //     console.log("Parcels:", this.utility.parcels);
            //     console.log("Utility value: ", child.utility.value);
            //     console.log("Upper bound: ", upperBound);
            //     console.log("Exploitation: ", exploitation);
            //     console.log("Visits: ", child.visits);
            //     console.log("Exploration: ", explorationParameter * exploration);
            //     console.log("---------");
            // }

            const score = exploitation + explorationParameter * exploration;
            if (score > bestScore) {
                bestScore = score;
                bestChild = child;
            }
        }

        if (bestChild === null) {
            // This should never happen.
            console.log("My state: ", this.state);
            console.log("--------------------------");
            for (const child of this.children) {
                console.log("Child: ", child.state.executedIntenion);
                console.log("Utility: ", child.utility);
                console.log("Visits: ", child.visits);
                console.log("--------------------------");
            }
            throw new Error("No best child found.");
        }

        return bestChild;
    }

    /**
     * Computes the upper bound of the value of the node.
     * The upper bound corresponds to the reward obtained if the agent could instantly pick up
     * all the parcels that are currently free and deliver them.
     *
     * @returns the upper bound of the value of the node.
     */
    private _computeUpperBound(): number {
        // const closestDelivery = this.beliefs.map.getClosestDeliveryPosition(this.state.position);
        // const { movementDuration } = Config.getEnvironmentConfig();
        // const distance = this.beliefs.map.distance(this.state.position, closestDelivery);
        // const arrivalTime = this.state.arrivalInstant.add(movementDuration.multiply(distance));

        let upperBound = Number.EPSILON;
        if (this.state.executedIntenion.type !== IntentionType.PUTDOWN) {
            for (const [, value] of this.state.pickedParcels) {
                upperBound += value.getValueByInstant(this.state.arrivalInstant);
            }
        }

        for (const intention of this.nextIntentions) {
            if (intention.type === IntentionType.PICKUP) {
                for (const parcel of this.beliefs.getParcelsByPosition(intention.position)) {
                    upperBound += parcel.value.getValueByInstant(this.state.arrivalInstant);
                }
            }
        }

        return upperBound;
    }

    /**
     * Sorts the next intentions according to their greedy value.
     */
    private _sortIntentions() {
        const start = this.children.length;

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

    // private _addPickupParcel(parcel: Parcel) {
    //     if (this.state.pickedParcels.some(([id]) => id.equals(parcel.id))) {
    //         throw new Error("I am adding a parcel that I already have.");
    //     }
    //     this.state.pickedParcels.push([parcel.id, parcel.value]);
    //     this.utility.parcels.set(parcel.id, parcel.value);

    //     if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
    //         this._reward += parcel.value.getValueByInstant(this.state.arrivalInstant);
    //         this.utility = this.utility.newWith(this._reward);
    //     } else {
    //         for (const child of this.children) {
    //             child._addPickupParcel(parcel);
    //         }
    //         this._updateUtility();
    //     }
    // }

    // private _removeNextIntention(i: number): number {
    //     this.nextIntentions.splice(i, 1);

    //     let totalVisitDiff = 0;

    //     if (this.children.length > i) {
    //         const child = this.children.splice(i, 1)[0];
    //         for (const grandChild of child.children) {
    //             const gcIntentionIdx = this.nextIntentions.findIndex((intention) => {
    //                 return intention.equals(grandChild.state.executedIntenion);
    //             });
    //             if (gcIntentionIdx === -1) {
    //                 if (grandChild.state.executedIntenion.type === IntentionType.PICKUP) {
    //                     console.log(
    //                         "In removeNextIntention this should not happen: ",
    //                         grandChild.state.executedIntenion,
    //                     );
    //                 }

    //                 continue;
    //             }

    //             if (this.children.length > gcIntentionIdx) {
    //                 // we have already expanded this intention
    //                 totalVisitDiff += grandChild.visits;
    //             } else {
    //                 // we can insert the grandchild as a child of this node
    //                 const { movementDuration } = Config.getEnvironmentConfig();
    //                 const distance = this.beliefs.map.distance(
    //                     this.state.position,
    //                     grandChild.state.position,
    //                 );
    //                 const newArrivalInstant = this.state.arrivalInstant.add(
    //                     movementDuration.multiply(distance),
    //                 );

    //                 grandChild._updateArrivalInstant(newArrivalInstant);

    //                 // swap the next intention with the grandchild's intention
    //                 this.nextIntentions[gcIntentionIdx] = this.nextIntentions[i];
    //                 this.nextIntentions[i] = grandChild.state.executedIntenion;
    //                 this.children[i] = grandChild;
    //                 grandChild.parent = this;
    //             }
    //         }

    //         this._updateUtility();
    //     }

    //     return totalVisitDiff;
    // }

    // private _updateArrivalInstant(newInstant: Instant) {
    //     this.state.arrivalInstant = newInstant;
    //     if (this.state.executedIntenion.type === IntentionType.PUTDOWN) {
    //         let newReward = 0;
    //         for (const [, value] of this.state.pickedParcels) {
    //             newReward += value.getValueByInstant(newInstant);
    //         }

    //         this._reward = newReward;
    //     }

    //     for (const child of this.children) {
    //         child._updateArrivalInstant(newInstant);
    //     }

    //     this._updateUtility();
    // }
}
