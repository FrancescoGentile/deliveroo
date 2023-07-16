//
//
//

import * as utils from 'src/utils';
import { HashMap } from 'src/utils';
import {
  Config,
  DecayingValue,
  EnviromentChange,
  Intention,
  IntentionType,
  Parcel,
  Position,
  Utility,
} from 'src/domain/structs';
import { Environment } from 'src/domain/environment';

import { Node } from './node';
import { State, NodeID } from './structs';

export class MonteCarloPlanner {
  public position: Position;

  private _intention: Intention | null = null;

  private _moveIntention: Intention | null = null;

  private _children: HashMap<NodeID, Node> = new HashMap();

  private _state: State<[Parcel, number, NodeID | null]>;

  private _visits: number = 0;

  public constructor(position: Position, environment: Environment) {
    this.position = position;

    this._state = {
      availableParcels: [],
      pickedParcels: [],
      arrivalTime: Date.now(),
      environment,
    };

    this._state.availableParcels = this.sort(environment.getFreeParcels());

    environment.onEnviromentChange(this.handleChanges.bind(this));
  }

  private greedyValue(parcel: Parcel): number {
    const distance = this._state.environment.distance(
      this.position,
      parcel.position
    );

    const distanceToDelivery = this._state.environment.distance(
      parcel.position,
      this._state.environment.getClosestDeliveryPosition(parcel.position)
    );

    const { movementDuration } = Config.getInstance();
    const timeToArrive = (distance + distanceToDelivery) * movementDuration;

    return parcel.value.getValueByInstant(Date.now() + timeToArrive);
  }

  private sort(parcels: Parcel[]): [Parcel, number, NodeID | null][] {
    const values: [Parcel, number, NodeID | null][] = parcels.map((parcel) => [
      parcel,
      this.greedyValue(parcel),
      null,
    ]);

    return values.sort((a, b) => b[1] - a[1]);
  }

  private setMoveIntention() {
    if (this._moveIntention !== null) {
      return;
    }

    const promisingPositions = this._state.environment.getPromisingPositions(
      this.position
    );

    let bestReward = Number.NEGATIVE_INFINITY;
    const now = Date.now();
    for (const [position, value] of promisingPositions) {
      const totalDistance =
        this._state.environment.distance(this.position, position) +
        this._state.environment.distance(
          position,
          this._state.environment.getClosestDeliveryPosition(position)
        );

      const totalTime = totalDistance * Config.getInstance().movementDuration;
      const reward = new DecayingValue(value, now).getValueByInstant(
        now + totalTime
      );
      if (reward > bestReward) {
        this._moveIntention = Intention.move(position);
        bestReward = reward;
      }
    }
  }

  private isFullyExpanded(): boolean {
    if (
      this._intention === null ||
      this._intention.type === IntentionType.PUTDOWN
    ) {
      return this._children.size === this._state.availableParcels.length;
    }

    return this._children.size === this._state.availableParcels.length + 1;
  }

  private selectChild(): Node {
    if (!this.isFullyExpanded()) {
      return this.expand();
    }

    return this.getBestChild(Math.sqrt(2));
  }

  private expand(): Node {
    const idx = this._state.availableParcels.findIndex((p) => p[2] === null);
    const { movementDuration } = Config.getInstance();

    const parcel = this._state.availableParcels[idx][0];
    const intention = Intention.pickup(parcel.position);

    const timeToArrive =
      this._state.environment.distance(this.position, parcel.position) *
      movementDuration;

    const parcels = this._state.availableParcels
      .filter((_, i) => i !== idx)
      .map((p) => p[0]);

    const state = {
      availableParcels: parcels,
      pickedParcels: [...this._state.pickedParcels, parcel],
      arrivalTime: Date.now() + timeToArrive,
      environment: this._state.environment,
    };

    const node = new Node(state, intention, null);
    const nodeID = NodeID.new();

    this._state.availableParcels[idx][2] = nodeID;
    this._children.set(nodeID, node);

    return node;
  }

  private getBestChild(explorationParameter: number): Node {
    const now = Date.now();
    let upperBound = 1e-5;
    for (const [parcel] of this._state.availableParcels) {
      upperBound += parcel.value.getValueByInstant(now);
    }

    let bestChild = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const { movementDuration } = Config.getInstance();
    for (const child of this._children.values()) {
      const distance = this._state.environment.distance(
        this.position,
        child.intention.position
      );
      const arrivalTime = now + distance * movementDuration;

      const exploitation =
        child.utility.getValueByInstant(arrivalTime) /
        child.visits /
        upperBound;
      const exploration = Math.sqrt(Math.log(this._visits) / child.visits);
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

  public run(): void {
    if (
      this._state.availableParcels.length === 0 &&
      (this._intention === null ||
        this._intention.type === IntentionType.PUTDOWN)
    ) {
      this.setMoveIntention();
    } else {
      let node = this.selectChild();
      while (!node.isTerminal()) {
        node = node.selectChild();
      }

      const utility = new Utility(0, [], node.state.arrivalTime);
      node.backpropagate(utility);
      this._visits += 1;

      setImmediate(this.run.bind(this));
    }
  }

  public getBestIntention(): Intention | null {
    if (this._moveIntention !== null) {
      return this._moveIntention;
    }

    let bestIntention: Intention | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const now = Date.now();
    const { movementDuration } = Config.getInstance();
    for (const child of this._children.values()) {
      const distance = this._state.environment.distance(
        this.position,
        child.intention.position
      );
      const arrivalTime = now + distance * movementDuration;
      const score = child.utility.getValueByInstant(arrivalTime) / child.visits;

      if (score > bestScore) {
        bestIntention = child.intention;
        bestScore = score;
      }
    }

    return bestIntention;
  }

  public handleChanges(changes: EnviromentChange): void {
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

    for (const child of this._children.values()) {
      child.handleChanges(changes);
    }
  }

  public performedIntention(intention: Intention) {
    if (this._moveIntention !== null && intention.equals(this._moveIntention)) {
      this._moveIntention = null;
      this.setMoveIntention();
      return;
    }

    const children = [...this._children.values()];
    const performedChild = children.find((child) =>
      child.intention.equals(intention)
    );

    if (performedChild === undefined) {
      throw new Error('Intention not found');
    }

    this._children = performedChild.children;
    this._intention = performedChild.intention;
    this._state = performedChild.state;
    this.position = intention.position;
    this._visits = performedChild.visits;

    for (const child of this._children.values()) {
      child.parent = null;
    }
  }
}
