//
//
//

import {
  Config,
  DecayingValue,
  EnviromentChange,
  Intention,
  MoveIntention,
  Parcel,
  PickUpIntention,
  Position,
  PutDownIntention,
  Utility,
} from 'src/domain/structs';
import { getRandomInt } from 'src/utils';

import { Environment } from 'src/domain/environment';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State {
  readonly availableParcels: [Parcel, Position][];

  readonly pickedParcels: Parcel[];

  readonly arrivalTime: number;

  readonly environment: Environment;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

class Node {
  public readonly utility: Utility;

  public readonly intention: Intention;

  public parent: Node | null;

  private readonly _state: State;

  private readonly _children: Node[];

  private _visits: number;

  private _hasPutDown: boolean;

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

  public get hasPutDown(): boolean {
    return this._hasPutDown;
  }

  public constructor(state: State, intention: Intention, parent: Node | null) {
    this.utility = new Utility(0, [], state.arrivalTime);
    this.intention = intention;
    this.parent = parent;
    this._state = state;
    this._children = [];
    this._visits = 0;
    this._hasPutDown = false;
    this._reward = 0;

    if (intention instanceof PutDownIntention) {
      this._hasPutDown = true;

      const parcels =
        intention.parcels === null ? state.pickedParcels : intention.parcels;

      for (const parcel of parcels) {
        this._reward += parcel.value.getValueByInstant(state.arrivalTime);
      }
    }
  }

  public addParcels(parcels: [Parcel, Position][]): void {
    this._state.availableParcels.push(...parcels);
    for (const child of this._children) {
      child.addParcels(parcels);
    }
  }

  public isFullyExpanded(): boolean {
    return this._state.availableParcels.length === 0 && this._hasPutDown;
  }

  public isTerminal(): boolean {
    return this.isFullyExpanded() && this._children.length === 0;
  }

  public selectChild(): Node {
    if (!this.isFullyExpanded()) {
      return this.expand();
    }

    return this.getBestChild(Math.sqrt(2));
  }

  public expand(): Node {
    let index;
    if (this._hasPutDown) {
      index = getRandomInt(0, this._state.availableParcels.length);
    } else {
      index = getRandomInt(0, this._state.availableParcels.length + 1);
    }

    let intention;
    let state;
    const { movementDuration } = Config.getInstance();
    if (index < this._state.availableParcels.length) {
      const [parcel, position] = this._state.availableParcels.splice(
        index,
        1
      )[0];
      intention = new PickUpIntention(position, [parcel]);
      const timeToArrive =
        this._state.environment.distance(this.intention.position, position) *
        movementDuration;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [...this._state.pickedParcels, parcel],
        arrivalTime: this._state.arrivalTime + timeToArrive,
        environment: this._state.environment,
      };
    } else {
      this._hasPutDown = true;
      const position = this._state.environment.getClosestDeliveryPosition(
        this.intention.position
      );
      intention = new PutDownIntention(position, this._state.pickedParcels);

      const timeToArrive =
        this._state.environment.distance(this.intention.position, position) *
        movementDuration;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [],
        arrivalTime: this._state.arrivalTime + timeToArrive,
        environment: this._state.environment,
      };
    }

    const node = new Node(state, intention, this);
    this._children.push(node);
    return node;
  }

  private getBestChild(explorationParameter: number): Node {
    if (this._children.length === 0) {
      throw new Error('No children');
    }

    let bestChild = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const child of this._children) {
      const exploitation =
        child.utility.getValueByInstant(child.state.arrivalTime) /
        child._visits;
      const exploration = Math.sqrt(Math.log(this._visits) / child._visits);
      const score = exploitation + explorationParameter * exploration;

      if (score > bestScore) {
        bestChild = child;
        bestScore = score;
      }
    }

    return bestChild!;
  }

  public backpropagate(utility: Utility) {
    // console.log('-----------------------------------------------');

    // console.log(utility._value);

    const tmp = utility.newWith(
      this._reward,
      this.state.pickedParcels,
      this.state.arrivalTime
    );

    // console.log(tmp._value);

    this.utility.add(tmp);

    // console.log(this.utility._value);

    // console.log('-----------------------------------------------');

    this._visits += 1;

    if (this.parent) {
      this.parent.backpropagate(tmp);
    }
  }
}

// ---------------------------------------------------------------------------
// MonteCarloPlanner
// ---------------------------------------------------------------------------

export class MonteCarloPlanner {
  public position: Position;

  private _moveIntention: MoveIntention | null = null;

  private _children: Node[] = [];

  private _state: State;

  private _hasPutDown: boolean = true;

  private _visits: number = 0;

  public constructor(position: Position, environment: Environment) {
    this.position = position;
    this._state = {
      availableParcels: [...environment.getFreeParcels()],
      pickedParcels: [],
      arrivalTime: Date.now(),
      environment,
    };

    environment.onEnviromentChange(this.handleChanges.bind(this));
  }

  public run(): void {
    if (
      this._children.length === 0 &&
      this._state.availableParcels.length === 0 &&
      this._hasPutDown
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
        this._moveIntention = new MoveIntention(position);
        bestReward = reward;
      }
    }
  }

  private selectChild(): Node {
    if (this._state.availableParcels.length !== 0 || !this._hasPutDown) {
      return this.expand();
    }

    return this.getBestChild(Math.sqrt(2));
  }

  private expand(): Node {
    const numOptions =
      (this._hasPutDown ? 0 : 1) + this._state.availableParcels.length;

    const index = getRandomInt(numOptions);

    let intention;
    let state;
    const { movementDuration } = Config.getInstance();

    if (index < this._state.availableParcels.length) {
      const [parcel, position] = this._state.availableParcels.splice(
        index,
        1
      )[0];
      intention = new PickUpIntention(position, [parcel]);
      const timeToArrive =
        this._state.environment.distance(this.position, position) *
        movementDuration;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [...this._state.pickedParcels, parcel],
        arrivalTime: Date.now() + timeToArrive,
        environment: this._state.environment,
      };
    } else {
      this._hasPutDown = true;
      const position = this._state.environment.getClosestDeliveryPosition(
        this.position
      );
      intention = new PutDownIntention(position, this._state.pickedParcels);

      const timeToArrive =
        this._state.environment.distance(this.position, position) *
        movementDuration;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [],
        arrivalTime: Date.now() + timeToArrive,
        environment: this._state.environment,
      };
    }

    const node = new Node(state, intention, null);
    this._children.push(node);
    return node;
  }

  private getBestChild(explorationParameter: number): Node {
    if (this._children.length === 0) {
      throw new Error('No children');
    }

    let bestChild = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const { movementDuration } = Config.getInstance();
    const now = Date.now();
    for (const child of this._children) {
      const distance = this._state.environment.distance(
        this.position,
        child.intention.position
      );
      const arrivalTime = now + distance * movementDuration;

      const exploitation =
        child.utility.getValueByInstant(arrivalTime) / child.visits;
      const exploration = Math.sqrt(Math.log(this._visits) / child.visits);
      const score = exploitation + explorationParameter * exploration;

      if (score > bestScore) {
        bestChild = child;
        bestScore = score;
      }
    }

    return bestChild!;
  }

  public getBestIntention(): Intention | null {
    if (this._moveIntention !== null) {
      return this._moveIntention;
    }

    let bestIntention: Intention | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const now = Date.now();
    const { movementDuration } = Config.getInstance();
    for (const child of this._children) {
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

    // if (bestIntention === null) {
    //   console.log('No best intention found');
    // } else {
    //   console.log(bestIntention);
    //   const idx = this._children.findIndex((child) =>
    //     child.intention.equals(bestIntention!)
    //   );
    //   const child = this._children[idx];
    //   const utility =
    //     child.utility.getValueByInstant(Date.now()) / child.visits;
    //   console.log(utility);
    // }

    return bestIntention;
  }

  public handleChanges(changes: EnviromentChange): void {
    if (changes.newFreeParcels.length !== 0) {
      this._state.availableParcels.push(...changes.newFreeParcels);
      for (const child of this._children) {
        child.addParcels(changes.newFreeParcels);
      }

      if (this._moveIntention !== null) {
        this._moveIntention = null;
        this.run();
      }
    }
  }

  public performedIntention(intention: Intention) {
    if (this._moveIntention !== null && intention.equals(this._moveIntention)) {
      this._moveIntention = null;
      this.setMoveIntention();
      return;
    }

    const performedChild = this._children.find((child) =>
      child.intention.equals(intention)
    );

    if (performedChild === undefined) {
      throw new Error('Intention not found');
    }

    this._children = performedChild.children;
    this._state = performedChild.state;
    this.position = intention.position;
    this._hasPutDown = performedChild.hasPutDown;
    this._visits = performedChild.visits;

    for (const child of this._children) {
      child.parent = null;
    }
  }
}
