//
//
//

import * as utils from 'src/utils';
import { HashMap } from 'src/utils';
import {
  Config,
  EnviromentChange,
  Intention,
  IntentionType,
  Parcel,
  Utility,
} from 'src/domain/structs';
import { State, NodeID } from './structs';

export class Node {
  public readonly utility: Utility;

  public readonly intention: Intention;

  public parent: Node | null;

  private readonly _state: State<[Parcel, number, NodeID | null]>;

  private readonly _children: HashMap<NodeID, Node>;

  private _visits: number;

  private readonly _reward: number;

  public get visits(): number {
    return this._visits;
  }

  public get children(): HashMap<NodeID, Node> {
    return this._children;
  }

  public get state(): State<[Parcel, number, NodeID | null]> {
    return this._state;
  }

  public constructor(
    state: State<Parcel>,
    intention: Intention,
    parent: Node | null
  ) {
    this.utility = new Utility(0, [], state.arrivalTime);
    this.intention = intention;
    this.parent = parent;
    this._children = new HashMap();
    this._visits = 0;
    this._reward = 0;

    this._state = {
      availableParcels: [],
      pickedParcels: state.pickedParcels,
      arrivalTime: state.arrivalTime,
      environment: state.environment,
    };

    this._state.availableParcels = this.sort(state.availableParcels);

    if (intention.type === IntentionType.PUTDOWN) {
      for (const parcel of state.pickedParcels) {
        this._reward += parcel.value.getValueByInstant(state.arrivalTime);
      }

      // state.pickedParcels.splice(0, state.pickedParcels.length);
    }
  }

  private greedyValue(parcel: Parcel): number {
    const { arrivalTime } = this._state;

    const distance = this._state.environment.distance(
      this.intention.position,
      parcel.position
    );

    const distanceToDelivery = this._state.environment.distance(
      parcel.position,
      this._state.environment.getClosestDeliveryPosition(parcel.position)
    );

    const { movementDuration } = Config.getInstance();
    const timeToArrive = (distance + distanceToDelivery) * movementDuration;

    return parcel.value.getValueByInstant(arrivalTime + timeToArrive);
  }

  private sort(parcels: Parcel[]): [Parcel, number, NodeID | null][] {
    const values: [Parcel, number, NodeID | null][] = parcels.map((parcel) => [
      parcel,
      this.greedyValue(parcel),
      null,
    ]);

    return values.sort((a, b) => b[1] - a[1]);
  }

  private createPutDownNode(): Node {
    const { movementDuration } = Config.getInstance();

    const position = this._state.environment.getClosestDeliveryPosition(
      this.intention.position
    );
    const intention = Intention.putdown(position);

    const timeToArrive =
      this._state.environment.distance(this.intention.position, position) *
      movementDuration;

    const parcels = this._state.availableParcels.map((p) => p[0]);
    const state = {
      availableParcels: parcels,
      pickedParcels: [...this._state.pickedParcels],
      arrivalTime: this._state.arrivalTime + timeToArrive,
      environment: this._state.environment,
    };

    return new Node(state, intention, this);
  }

  private createPickUpNode(idx: number): Node {
    const { movementDuration } = Config.getInstance();

    const parcel = this._state.availableParcels[idx][0];
    const intention = Intention.pickup(parcel.position);

    const timeToArrive =
      this._state.environment.distance(
        this.intention.position,
        parcel.position
      ) * movementDuration;

    const parcels = this._state.availableParcels
      .filter((_, i) => i !== idx)
      .map((p) => p[0]);

    let pickedParcels: Parcel[];
    if (this.intention.type === IntentionType.PUTDOWN) {
      pickedParcels = [parcel];
    } else {
      pickedParcels = [...this._state.pickedParcels, parcel];
    }

    const state = {
      availableParcels: parcels,
      pickedParcels,
      arrivalTime: this._state.arrivalTime + timeToArrive,
      environment: this._state.environment,
    };

    return new Node(state, intention, this);
  }

  public handleChanges(changes: EnviromentChange): void {
    for (const child of this._children.values()) {
      child.handleChanges(changes);
    }

    for (const parcel of changes.noLongerFreeParcels) {
      const index = this._state.availableParcels.findIndex((p) =>
        p[0].id.equals(parcel.id)
      );

      if (index !== -1) {
        const rem = this._state.availableParcels.splice(index, 1)[0];
        if (rem[2] !== null) {
          this._children.delete(rem[2]!);
        }
      }
    }

    if (changes.newFreeParcels.length > 0) {
      this._state.availableParcels = utils.merge(
        this._state.availableParcels,
        this.sort(changes.newFreeParcels),
        (a, b) => b[1] - a[1]
      );
    }
  }

  public isFullyExpanded(): boolean {
    if (this.intention.type === IntentionType.PUTDOWN) {
      return this._children.size === this._state.availableParcels.length;
    }

    return this._children.size === this._state.availableParcels.length + 1;
  }

  public isTerminal(): boolean {
    return this.isFullyExpanded() && this._children.size === 0;
  }

  public selectChild(): Node {
    if (!this.isFullyExpanded()) {
      return this.expand();
    }

    return this.getBestChild(Math.sqrt(2));
  }

  public expand(): Node {
    let node;
    const nodeID = NodeID.new();
    if (
      this.intention.type !== IntentionType.PUTDOWN &&
      this._children.size === 0
    ) {
      node = this.createPutDownNode();
    } else {
      const idx = this._state.availableParcels.findIndex((p) => p[2] === null);
      node = this.createPickUpNode(idx);
      this._state.availableParcels[idx][2] = nodeID;
    }

    this._children.set(nodeID, node);
    return node;
  }

  private getBestChild(explorationParameter: number): Node {
    let upperBound = 1e-5;
    for (const [parcel] of this._state.availableParcels) {
      upperBound += parcel.value.getValueByInstant(this.state.arrivalTime);
    }

    let bestChild = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const child of this._children.values()) {
      const exploitation =
        child.utility.getValueByInstant(child.state.arrivalTime) /
        child._visits /
        upperBound;
      const exploration = Math.sqrt(Math.log(this._visits) / child._visits);
      const score = exploitation + explorationParameter * exploration;

      if (score > bestScore) {
        bestChild = child;
        bestScore = score;
      }
    }

    if (bestChild === null) {
      throw new Error('No children');
    }

    return bestChild;
  }

  public backpropagate(utility: Utility) {
    let toBePassed: Utility;

    if (this.intention.type === IntentionType.PUTDOWN) {
      const tmp = utility.newWith(
        this._reward,
        this.state.pickedParcels,
        this.state.arrivalTime
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
