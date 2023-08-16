//
//
//

// import treeify from 'treeify';
import { HashMap, Instant } from 'src/utils';
import {
  Config,
  DecayingValue,
  Direction,
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

  private _nextMoveIntention: [Intention, number] | null = null;

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

    environment.onParcelsChange(this.onParcelsChange.bind(this));
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

  private getBestMoveIntention(
    actualPaths: HashMap<Intention, [Position, Direction[] | null]>
  ): [Intention, number] | null {
    const promisingPositions = this._state.environment.getPromisingPositions(this.position);

    let bestIntention: Intention | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestReward = Number.NEGATIVE_INFINITY;
    const now = Instant.now();

    for (const [movePosition, value] of promisingPositions) {
      const intention = Intention.move(movePosition);
      let distanceToMovePosition: number;
      if (actualPaths.has(intention)) {
        const [position, path] = actualPaths.get(intention)!;
        if (path === null) {
          // if the intention is not reachable, we don't consider it
          continue;
        } else {
          distanceToMovePosition =
            this._state.environment.distance(this.position, position) + path.length;
        }
      } else {
        distanceToMovePosition = this._state.environment.distance(this.position, movePosition);
      }

      const deliveryPosition = this._state.environment.getClosestDeliveryPosition(movePosition);
      const distanceToDelivery = this._state.environment.distance(movePosition, deliveryPosition);
      const totalDistance = distanceToMovePosition + distanceToDelivery;

      const { movementDuration } = Config.getInstance();
      const totalTime = movementDuration.multiply(totalDistance);
      const reward = new DecayingValue(value, now).getValueByInstant(now.add(totalTime));

      if (reward > bestReward) {
        bestIntention = Intention.move(movePosition);
        bestDistance = distanceToMovePosition;
        bestReward = reward;
      }
    }

    if (bestIntention === null) {
      return null;
    }

    return [bestIntention, bestDistance];
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
    const nextIntention = this._nextIntentions[idx];

    let availablePositions: Position[];
    let pickedParcels: Parcel[];

    if (nextIntention.type === IntentionType.PUTDOWN) {
      availablePositions = this._state.availablePositions;
      pickedParcels = this._state.pickedParcels;
    } else {
      availablePositions = this._state.availablePositions.filter(
        (position) => !position.equals(nextIntention.position)
      );

      if (this._lastIntention === null || this._lastIntention.type === IntentionType.PUTDOWN) {
        pickedParcels = [];
      } else {
        pickedParcels = [...this._state.pickedParcels];
      }
      pickedParcels.push(...this._state.environment.getParcelsByPosition(nextIntention.position));
    }

    const distance = this._state.environment.distance(this.position, nextIntention.position);
    const { movementDuration } = Config.getInstance();
    const arrivalTime = this._state.arrivalTime.add(movementDuration.multiply(distance));

    const state = {
      availablePositions,
      pickedParcels,
      arrivalTime,
      environment: this._state.environment,
    };

    const node = new Node(state, nextIntention, null);
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

    for (const parcel of this._state.pickedParcels) {
      upperBound += parcel.value.getValueByInstant(now);
    }

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
    this._nextIteration = undefined;
    if (this._nextIntentions.length === 0) {
      return;
    }

    let node = this.selectChild();
    while (!node.isTerminal()) {
      node = node.selectChild();
    }

    const utility = new Utility(0, [], node.state.arrivalTime);
    node.backpropagate(utility);
    this._visits += 1;

    this._nextIteration = setImmediate(this.run.bind(this));
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

  public getBestIntention(
    actualPaths: HashMap<Intention, [Position, Direction[] | null]>
  ): Intention | null {
    if (this._nextMoveIntention !== null) {
      // we previously set the next move intention, this means that none of the
      // children has a score greater than 0, so it is better to move

      if (!actualPaths.has(this._nextMoveIntention[0])) {
        // the path is not blocked, so we can move
        return this._nextMoveIntention[0];
      }

      const [, path] = actualPaths.get(this._nextMoveIntention[0])!;

      if (path === null) {
        // the move intention is not reachable, so we search for a new one
        this._nextMoveIntention = this.getBestMoveIntention(actualPaths);
        // if all the move intentions are not reachable, we return null
        return this._nextMoveIntention === null ? null : this._nextMoveIntention[0];
      }

      if (path.length <= this._nextMoveIntention[1]) {
        // the agent is already moving to the next move intention
        // so we don't change it
        return this._nextMoveIntention[0];
      }

      // the path is blocked, the agent computed a new path
      // to verify if there is a better move intention, we search for a new one
      this._nextMoveIntention = this.getBestMoveIntention(actualPaths);
      return this._nextMoveIntention === null ? null : this._nextMoveIntention[0];
    }

    let bestIntention: Intention | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    const now = Instant.now();
    const { movementDuration } = Config.getInstance();
    for (const child of this._children.values()) {
      let distance: number;
      if (actualPaths.has(child.intention)) {
        const [position, path] = actualPaths.get(child.intention)!;
        if (path === null) {
          // if the intention is not reachable, we don't consider it
          continue;
        } else {
          distance = this._state.environment.distance(this.position, position) + path.length;
        }
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

    if (bestScore <= 0) {
      // no pickup or putdown intention has a positive score
      // so we search for a move intention

      if (this.isFullyExpanded()) {
        // if the root is fully expanded, we can clear the children
        // since no child could have a positive score by further exploration

        this._children.splice(0, this._children.length);
        clearImmediate(this._nextIteration);
        this._nextIteration = undefined;
        this._nextMoveIntention = this.getBestMoveIntention(actualPaths);
        return this._nextMoveIntention === null ? null : this._nextMoveIntention[0];
      }

      // if the root is not fully expanded, we temporaruly return the best move intention
      const moveIntention = this.getBestMoveIntention(actualPaths);
      return moveIntention === null ? null : moveIntention[0];
    }

    // console.log(treeify.asTree(this.getTree(this._children, now, this.position), true, false));
    // console.log("----------------------------------")

    return bestIntention!;
  }

  public onParcelsChange(): void {
    this._children.splice(0, this._children.length);
    this.setNextIntentions();

    this._nextMoveIntention = null;
    clearImmediate(this._nextIteration);
    this._nextIteration = undefined;
    this.run();
  }

  public performedIntention(intention: Intention) {
    if (intention.type === IntentionType.MOVE) {
      this._nextMoveIntention = null;
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
