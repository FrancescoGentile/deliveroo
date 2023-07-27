//
//
//

// import treeify from 'treeify';
import { Instant } from 'src/utils';
import {
  Config,
  DecayingValue,
  Intention,
  IntentionType,
  Parcel,
  Position,
  Utility,
} from 'src/domain/structs';
import { Environment } from 'src/domain/environment';
import { Node } from './node';
import { State, greedySortIntentions } from './utils';

export class MonteCarloPlanner {
  public position: Position;

  private _lastIntention: Intention | null = null;

  private _nextMoveIntention: Intention | null = null;

  private _nextIntentions: Intention[] = [];

  private _children: Node[] = [];

  private _state: State;

  private _visits: number = 0;

  private _nextIteration?: NodeJS.Immediate;

  public constructor(position: Position, environment: Environment) {
    this.position = position;

    this._state = {
      availablePositions: [],
      pickedParcels: [],
      arrivalTime: Instant.now(),
      environment,
    };

    this.setNextIntentions();

    environment.onEnvironmentChange(this.onEnvironmentChanged.bind(this));
  }

  private setNextIntentions() {
    this._state.availablePositions = this._state.environment.getParcelsPositions();
    const intentions = this._state.availablePositions.map((p) => Intention.pickup(p));

    if (this._lastIntention !== null && this._lastIntention.type !== IntentionType.PUTDOWN) {
      const deliveryPosition = this._state.environment.getClosestDeliveryPosition(this.position);
      intentions.push(Intention.putdown(deliveryPosition));
    }

    this._nextIntentions = greedySortIntentions(
      intentions,
      this._state.pickedParcels,
      this.position,
      this._state.arrivalTime,
      this._state.environment
    );
  }

  private getBestMoveIntention(): Intention {
    const promisingPositions = this._state.environment.getPromisingPositions(this.position);

    let intention: Intention | null = null;
    let bestReward = Number.NEGATIVE_INFINITY;
    const now = Instant.now();

    for (const [movePosition, value] of promisingPositions) {
      const deliveryPosition = this._state.environment.getClosestDeliveryPosition(movePosition);
      const totalDistance =
        this._state.environment.distance(this.position, movePosition) +
        this._state.environment.distance(movePosition, deliveryPosition);

      const { movementDuration } = Config.getInstance();
      const totalTime = movementDuration.multiply(totalDistance);
      const reward = new DecayingValue(value, now).getValueByInstant(now.add(totalTime));

      if (reward > bestReward) {
        intention = Intention.move(movePosition);
        bestReward = reward;
      }
    }

    if (intention === null) {
      throw new Error('No best move intention found');
    }

    return intention;
  }

  private isFullyExpanded(): boolean {
    return this._children.length === this._nextIntentions.length;
  }

  private selectChild(): Node {
    if (!this.isFullyExpanded()) {
      return this.expand();
    }

    return this.getBestChild();
  }

  private expand(): Node {
    const idx = this._children.length;
    const intention = this._nextIntentions[idx];

    let availablePositions: Position[];
    let pickedParcels: Parcel[];
    if (intention.type === IntentionType.PUTDOWN) {
      availablePositions = this._state.availablePositions;
      pickedParcels = this._state.pickedParcels;
    } else {
      availablePositions = this._state.availablePositions.filter(
        (position) => !position.equals(intention.position)
      );

      pickedParcels = [
        ...this._state.pickedParcels,
        ...this._state.environment.getParcelsByPosition(this.position),
      ];
    }

    const distance = this._state.environment.distance(this.position, intention.position);
    const { movementDuration } = Config.getInstance();
    const arrivalTime = this._state.arrivalTime.add(movementDuration.multiply(distance));

    const state = {
      availablePositions,
      pickedParcels,
      arrivalTime,
      environment: this._state.environment,
    };

    const node = new Node(state, intention, null);
    this._children.push(node);

    return node;
  }

  private getBestChild(explorationParameter: number = Math.sqrt(2)): Node {
    if (this._children.length === 0) {
      throw new Error('No children');
    } else if (this._children.length === 1) {
      return this._children[0];
    }

    const now = Instant.now();
    let upperBound = Number.EPSILON;
    for (const intention of this._nextIntentions) {
      if (intention.type === IntentionType.PUTDOWN) {
        continue;
      }

      for (const parcel of this._state.environment.getParcelsByPosition(intention.position)) {
        upperBound += parcel.value.getValueByInstant(now);
      }
    }

    let bestChild = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const { movementDuration } = Config.getInstance();

    for (const child of this._children.values()) {
      const distance = this._state.environment.distance(this.position, child.intention.position);
      const arrivalTime = now.add(movementDuration.multiply(distance));

      const exploitation = child.utility.getValueByInstant(arrivalTime) / child.visits / upperBound;
      const exploration = Math.sqrt(Math.log(this._visits) / child.visits);
      const score = exploitation + explorationParameter * exploration;

      if (score > bestScore) {
        bestChild = child;
        bestScore = score;
      }
    }

    if (bestChild === null) {
      throw new Error('Best child not found');
    }

    return bestChild;
  }

  public run(): void {
    if (this._nextIntentions.length === 0) {
      this._nextMoveIntention = this.getBestMoveIntention();
      this._nextIteration = undefined;
    } else {
      let node = this.selectChild();
      while (!node.isTerminal()) {
        node = node.selectChild();
      }

      const utility = new Utility(0, [], node.state.arrivalTime);
      node.backpropagate(utility);
      this._visits += 1;

      this._nextIteration = setImmediate(this.run.bind(this));
    }
  }

  private getTree(children: Node[], startTime: Instant, position: Position): any {
    const res: any = {};

    for (const [idx, node] of children.entries()) {
      const distance = this._state.environment.distance(position, node.intention.position);
      const { movementDuration } = Config.getInstance();
      const arrivalTime = startTime.add(movementDuration.multiply(distance));

      res[`child_${idx}`] = {
        intention: node.intention,
        visits: node.visits,
        score: node.utility.getValueByInstant(arrivalTime) / node.visits,
        ...this.getTree(node.children, arrivalTime, node.intention.position),
      };
    }

    return res;
  }

  public getBestIntention(actual_distance: [Intention, number] | null): Intention {
    if (this._nextMoveIntention !== null) {
      return this._nextMoveIntention;
    }

    if (this._children.length === 0) {
      clearImmediate(this._nextIteration);
      this._nextIteration = undefined;
      this.run();

      if (this._children.length === 0) {
        return this._nextMoveIntention!;
      }

      return this._children[0].intention;
    }

    let bestIntention: Intention | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const now = Instant.now();
    const { movementDuration } = Config.getInstance();
    for (const child of this._children.values()) {
      let distance: number;
      if (actual_distance !== null && actual_distance[0].equals(child.intention)) {
        [, distance] = actual_distance;
      } else {
        distance = this._state.environment.distance(this.position, child.intention.position);
      }
      const arrivalTime = now.add(movementDuration.multiply(distance));
      let score = child.utility.getValueByInstant(arrivalTime) / child.visits;

      if (child.intention.type === IntentionType.PICKUP) {
        let minEnemysDistance = Number.POSITIVE_INFINITY;
        for (const enemy of this._state.environment.getVisibleAgents()) {
          if (enemy.random) {
            continue;
          }

          const enemyDistance = this._state.environment.distance(
            enemy.currentPosition,
            child.intention.position
          );

          if (enemyDistance < minEnemysDistance) {
            minEnemysDistance = enemyDistance;
          }
        }

        if (minEnemysDistance < distance) {
          const factor = 1 - 1 / (1 + minEnemysDistance);
          score *= factor ** 2;
        }
      }

      if (score > bestScore) {
        bestIntention = child.intention;
        bestScore = score;
      }
    }

    // console.log(treeify.asTree(this.getTree(this._children, now, this.position), true, false));

    return bestIntention!;
  }

  public onEnvironmentChanged(): void {
    this._children.splice(0, this._children.length);
    this.setNextIntentions();

    this._nextMoveIntention = null;
    clearImmediate(this._nextIteration);
    this._nextIteration = undefined;
    this.run();
  }

  public performedIntention(intention: Intention) {
    if (this._nextMoveIntention !== null && intention.equals(this._nextMoveIntention)) {
      this._nextMoveIntention = this.getBestMoveIntention();
      return;
    }

    const idx = this._nextIntentions.findIndex((i) => i.equals(intention));
    const child = this._children[idx];

    if (child === undefined) {
      throw new Error('Intention not found');
    }

    this._nextIntentions = child.nextIntentions;
    this._children = child.children;
    this._lastIntention = child.intention;
    this._state = child.state;
    this.position = intention.position;
    this._visits = child.visits;

    for (const c of this._children) {
      c.parent = null;
    }
  }
}
