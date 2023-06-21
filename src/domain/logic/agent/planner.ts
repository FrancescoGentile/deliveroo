//
//
//

import {
  Config,
  Intention,
  Location,
  Parcel,
  PickUpIntention,
  PutDownIntention,
  Utility,
} from 'src/domain/models';
import { getRandomInt, sleep } from 'src/utils';

import { Environment } from 'src/domain/ports';

interface State {
  readonly availableParcels: Parcel[];

  readonly pickedParcels: Parcel[];

  readonly arrivalTime: number;

  readonly environment: Environment;
}

class Node {
  private constructor(
    public readonly utility: Utility,
    public readonly intention: Intention,
    public parent: Node | null,
    private readonly _state: State,
    private readonly _children: Node[],
    private _visits: number,
    private _hasPutDown: boolean,
    private readonly _reward: number
  ) {}

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

  public static new(
    state: State,
    intention: Intention,
    parent: Node | null
  ): Node {
    const utility = Utility.new(0, [], state.arrivalTime);

    let hasPutDown = false;
    let reward = 0;

    if (intention instanceof PutDownIntention) {
      hasPutDown = true;

      const parcels =
        intention.parcels === null ? state.pickedParcels : intention.parcels;

      for (const parcel of parcels) {
        reward += parcel._value.getValueByInstant(state.arrivalTime);
      }
    }

    return new Node(
      utility,
      intention,
      parent,
      state,
      [],
      0,
      hasPutDown,
      reward
    );
  }

  public addParcels(parcels: Parcel[]): void {
    this._state.availableParcels.concat(parcels);
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
    const moveSpeed = Config.getInstance().movementDuration;
    if (index < this._state.availableParcels.length) {
      const parcel = this._state.availableParcels.splice(index, 1)[0];
      const location = this._state.environment.getParcelLocation(parcel._id);
      intention = PickUpIntention.new(location, [parcel]);
      const timeToArrive =
        this._state.environment.distance(this.intention.position, location) /
        moveSpeed;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [...this._state.pickedParcels, parcel],
        arrivalTime: this._state.arrivalTime + timeToArrive,
        environment: this._state.environment,
      };
    } else {
      this._hasPutDown = true;
      const location = this._state.environment.getClosestDeliveryLocation(
        this.intention.position
      );
      intention = PutDownIntention.new(location, this._state.pickedParcels);

      const timeToArrive =
        this._state.environment.distance(this.intention.position, location) /
        moveSpeed;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [],
        arrivalTime: this._state.arrivalTime + timeToArrive,
        environment: this._state.environment,
      };
    }

    const node = Node.new(state, intention, this);
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
    const tmp = utility.newFrom(
      this._reward,
      this.state.pickedParcels,
      this.state.arrivalTime
    );

    this.utility.add(tmp);
    this._visits += 1;

    if (this.parent) {
      this.parent.backpropagate(this.utility);
    }
  }
}

export class MonteCarloPlanner {
  private constructor(
    public location: Location,
    private _children: Node[],
    private _state: State,
    private _hasPutDown: boolean,
    private _visits: number
  ) {}

  public static async new(
    location: Location,
    environment: Environment
  ): Promise<MonteCarloPlanner> {
    // this is a temporary solution until the case in which there are no parcels
    // is handled
    let parcels = [...environment.getParcels().values()];
    while (parcels.length === 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
      parcels = [...environment.getParcels().values()];
    }

    const state = {
      availableParcels: parcels,
      pickedParcels: [],
      arrivalTime: Date.now(),
      environment,
    };

    return new MonteCarloPlanner(location, [], state, true, 0);
  }

  public async run(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const changes = this._state.environment.getChanges();
      if (changes !== null) {
        this.addParcels(changes.newParcels);
      }

      let node = this.selectChild();
      while (!node.isTerminal()) {
        node = node.selectChild();
      }

      const utility = Utility.new(0, [], node.state.arrivalTime);
      node.backpropagate(utility);
      this._visits += 1;

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }
  }

  private selectChild(): Node {
    if (this._state.availableParcels.length !== 0 || !this._hasPutDown) {
      return this.expand();
    }

    return this.getBestChild(Math.sqrt(2));
  }

  private expand(): Node {
    let index;
    if (this._hasPutDown) {
      index = getRandomInt(0, this._state.availableParcels.length);
    } else {
      index = getRandomInt(0, this._state.availableParcels.length + 1);
    }

    let intention;
    let state;
    const moveSpeed = Config.getInstance().movementDuration;
    if (index < this._state.availableParcels.length) {
      const parcel = this._state.availableParcels.splice(index, 1)[0];
      const location = this._state.environment.getParcelLocation(parcel._id);
      intention = PickUpIntention.new(location, [parcel]);
      const timeToArrive =
        this._state.environment.distance(this.location, location) / moveSpeed;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [...this._state.pickedParcels, parcel],
        arrivalTime: Date.now() + timeToArrive,
        environment: this._state.environment,
      };
    } else {
      this._hasPutDown = true;
      const location = this._state.environment.getClosestDeliveryLocation(
        this.location
      );
      intention = PutDownIntention.new(location, this._state.pickedParcels);

      const timeToArrive =
        this._state.environment.distance(this.location, location) / moveSpeed;

      state = {
        availableParcels: [...this._state.availableParcels],
        pickedParcels: [],
        arrivalTime: Date.now() + timeToArrive,
        environment: this._state.environment,
      };
    }

    const node = Node.new(state, intention, null);
    this._children.push(node);
    return node;
  }

  private getBestChild(explorationParameter: number): Node {
    if (this._children.length === 0) {
      throw new Error('No children');
    }

    let bestChild = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const moveSpeed = Config.getInstance().movementDuration;
    const now = Date.now();
    for (const child of this._children) {
      const distance = this._state.environment.distance(
        this.location,
        child.intention.position
      );
      const arrivalTime = now + distance / moveSpeed;

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

  public getBestIntention(): Intention {
    if (this._children.length === 0) {
      throw new Error('No children');
    }

    let bestIntention = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const now = Date.now();
    const moveSpeed = Config.getInstance().movementDuration;
    for (const child of this._children) {
      const distance = this._state.environment.distance(
        this.location,
        child.intention.position
      );
      const arrivalTime = now + distance / moveSpeed;
      const score = child.utility.getValueByInstant(arrivalTime);

      if (score > bestScore) {
        bestIntention = child.intention;
        bestScore = score;
      }
    }

    return bestIntention!;
  }

  public addParcels(parcels: Parcel[]): void {
    this._state.availableParcels.concat(parcels);
    for (const child of this._children) {
      child.addParcels(parcels);
    }
  }

  public performedIntention(intention: Intention) {
    const performedChild = this._children.find((child) =>
      child.intention.equals(intention)
    );

    if (performedChild === undefined) {
      throw new Error('Intention not found');
    }

    this._children = performedChild.children;
    this._state = performedChild.state;
    this.location = intention.position;
    this._hasPutDown = performedChild.hasPutDown;
    this._visits = performedChild.visits;

    for (const child of this._children) {
      child.parent = null;
    }
  }
}
