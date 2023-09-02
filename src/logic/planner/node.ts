//
//
//

import { HashMap, HashSet, Hashable, Instant, categoricalSample, getRandomInt } from 'src/utils';
import { GraphMap } from '../map';
import { AgentID, GameConfig, Intention, IntentionType, Position, Utility } from '../structs';
import { BeliefSet } from './beliefs';
import { AgentPotentialIntentions, AgentState, JointIntention } from './structs';

class NodeID implements Hashable {
  private static _nextID: number = 0;

  private readonly _id: string;

  public constructor() {
    this._id = NodeID._nextID.toString();
    NodeID._nextID += 1;
  }

  public hash(): string {
    return this._id;
  }
}

export class Node {
  public readonly id: NodeID = new NodeID();

  private readonly _beliefs: BeliefSet;

  private readonly _map: GraphMap;

  public parent: Node | null = null;

  public visits: number = 0;

  private readonly _instant: Instant;

  public readonly utility: Utility;

  private readonly _availablePositions: HashSet<Position>;

  public readonly agentsStates: HashMap<AgentID, AgentState>;

  private readonly _agentsPotentialIntentions: HashMap<AgentID, AgentPotentialIntentions>;

  private readonly _jointToChild: HashMap<JointIntention, Node> = new HashMap();

  private readonly _childToJoint: HashMap<NodeID, JointIntention> = new HashMap();

  public constructor(
    beliefs: BeliefSet,
    map: GraphMap,
    instant: Instant,
    availablePositions: HashSet<Position>,
    states: HashMap<AgentID, AgentState>
  ) {
    this._beliefs = beliefs;
    this._map = map;
    this._instant = instant;
    this.utility = Utility.zero(instant);
    this._availablePositions = availablePositions;
    this.agentsStates = states;
    this._agentsPotentialIntentions = this._getPotentialIntentions();
  }

  public isTerminal(): boolean {
    return this._agentsPotentialIntentions.size === 0;
  }

  public selectChild(): Node {
    if (this.isTerminal()) {
      throw new Error('Cannot select child of terminal node.');
    }

    const jointIntentions = this._selectJointIntention();
    if (this._jointToChild.has(jointIntentions)) {
      return this._jointToChild.get(jointIntentions)!;
    }

    const child = this._createNode(jointIntentions);
    this._jointToChild.set(jointIntentions, child);
    this._childToJoint.set(child.id, jointIntentions);

    return child;
  }

  public backpropagate(childUtility: Utility, child: Node | null): void {
    let utility = childUtility;
    for (const id of this._agentsPotentialIntentions.keys()) {
      const state = this.agentsStates.get(id)!;

      if (state.intention?.type === IntentionType.PUTDOWN) {
        const reward = state.carriedParcels.reduce(
          (acc, parcel) => acc + parcel.value.getValueByInstant(this._instant),
          0
        );

        utility = utility.newWith(reward, state.carriedParcels, this._instant);
      }
    }

    this.utility.add(utility);

    this.visits += 1;

    if (child !== null) {
      const jointIntention = this._childToJoint.get(child.id)!;
      for (const [id, intention] of jointIntention.entries()) {
        const { intentions, utilities, visits } = this._agentsPotentialIntentions.get(id)!;
        let idx;
        if (intention !== null) {
          idx = intentions.findIndex((i) => i?.equals(intention));
        } else {
          idx = intentions.length - 1;
        }

        utilities[idx].add(utility);
        visits[idx] += 1;
      }
    }

    if (this.parent !== null) {
      this.parent.backpropagate(utility, this);
    }
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private _getPotentialIntentions(): HashMap<AgentID, AgentPotentialIntentions> {
    const freeAgents = [...this.agentsStates.entries()].filter(([_, state]) => state.terminated);
    const pickupScores = this._getPickupScores(freeAgents);

    const agentsPotentialIntentions: HashMap<AgentID, [Intention, number][]> = new HashMap();
    // add putdown intentions to agents that have not just executed a putdown
    for (const [id, state] of freeAgents) {
      if (state.intention!.type !== IntentionType.PUTDOWN) {
        const distance = this._map.distanceToDelivery(state.position);
        const { movementDuration } = GameConfig.getInstance();
        const timeToArrive = movementDuration.multiply(distance);
        const arrivalTime = this._instant.add(timeToArrive);

        let value = 0;
        for (const parcel of state.carriedParcels) {
          value += parcel.value.getValueByInstant(arrivalTime);
        }

        agentsPotentialIntentions.set(id, [
          [Intention.putdown(this._map.getClosestDeliveryPosition(state.position)), value],
        ]);
      } else {
        agentsPotentialIntentions.set(id, []);
      }
    }

    const maxIntentionsPerAgent = Math.floor(this._availablePositions.size / freeAgents.length);

    // assign pickup intentions to agents
    for (const [intention, scores] of pickupScores) {
      let assigned = false;

      for (const [id, score] of scores) {
        const potentialIntentions = agentsPotentialIntentions.get(id)!;

        if (potentialIntentions.length < maxIntentionsPerAgent) {
          potentialIntentions.push([intention, score]);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        for (const [id, score] of scores) {
          if (agentsPotentialIntentions.get(id)!.length < maxIntentionsPerAgent + 1) {
            agentsPotentialIntentions.get(id)!.push([intention, score]);
            break;
          }
        }
      }

      if (!assigned) {
        throw new Error('Could not assign intention to any agent.');
      }
    }

    const result = new HashMap<AgentID, AgentPotentialIntentions>();
    for (const [id, intentions] of agentsPotentialIntentions.entries()) {
      if (intentions.length === 0) {
        // if no intentions were assigned to an agent (this happens when there are more agents than
        // available positions), we do not consider it since the only possible intention is to wait
        // indefinitely
        continue;
      }

      result.set(id, {
        intentions: [intentions[0][0], ...intentions.slice(1).map(([i]) => i), null],
        utilities: [],
        visits: [],
      });
    }

    return result;
  }

  private _getPickupScores(agents: [AgentID, AgentState][]): [Intention, [AgentID, number][]][] {
    const scores: [Intention, [AgentID, number][]][] = [];
    for (const pickupPosition of this._availablePositions.values()) {
      const agentScores = agents.map(([id, state]) => {
        const distanceToPickup = this._map.distance(state.position, pickupPosition);
        const distanceToDelivery = this._map.distanceToDelivery(pickupPosition);
        const distance = distanceToPickup + distanceToDelivery;

        const { movementDuration } = GameConfig.getInstance();
        const timeToArrive = movementDuration.multiply(distance);
        const arrivalTime = this._instant.add(timeToArrive);

        let value = 0;
        for (const parcel of this._beliefs.getParcelsByPosition(pickupPosition)) {
          value += parcel.value.getValueByInstant(arrivalTime);
        }

        for (const parcel of state.carriedParcels) {
          value += parcel.value.getValueByInstant(arrivalTime);
        }

        return [id, value] as [AgentID, number];
      });

      scores.push([Intention.pickup(pickupPosition), agentScores]);
    }

    for (const [, parcelScores] of scores) {
      // sort parcel scores in descending order
      parcelScores.sort((a, b) => b[1] - a[1]);
    }

    scores.sort(([, a], [, b]) => {
      const aMaxDiff = a[0][1] - a[a.length - 1][1];
      const bMaxDiff = b[0][1] - b[b.length - 1][1];

      return bMaxDiff - aMaxDiff;
    });

    return scores;
  }

  private _selectJointIntention(): JointIntention {
    const nextIntentions: [AgentID, Intention | null][] = [];

    let numberNullIntentions = 0;
    for (const [id, potentialIntentions] of this._agentsPotentialIntentions.entries()) {
      const { intentions, utilities, visits } = potentialIntentions;

      if (intentions.length === 0) {
        nextIntentions.push([id, null] as [AgentID, Intention | null]);
      } else if (utilities.length < intentions.length) {
        const intention = intentions[utilities.length];
        if (intention === null) {
          numberNullIntentions += 1;
        }

        utilities.push(Utility.zero(this._instant));
        visits.push(0);

        nextIntentions.push([id, intention] as [AgentID, Intention]);
        continue;
      } else {
        const weights = utilities.map(
          (utility, idx) => utility.getValueByInstant(this._instant) / visits[idx]
        );
        const [_, intention] = categoricalSample(weights, intentions);

        if (intention === null) {
          numberNullIntentions += 1;
        }

        nextIntentions.push([id, intention] as [AgentID, Intention]);
      }
    }

    if (numberNullIntentions === nextIntentions.length) {
      // we cannot have all agents waiting indefinitely
      // so we select a random agent and sample from its intentions
      const agentIdx = getRandomInt(0, nextIntentions.length);
      const { intentions, utilities, visits } = this._agentsPotentialIntentions.get(
        nextIntentions[agentIdx][0]
      )!;

      if (visits[visits.length - 1] === 0) {
        // the null intention was just added, so we remove it
        visits.pop();
        utilities.pop();
        intentions.pop();
      }

      const weights = utilities.map(
        (utility, idx) => utility.getValueByInstant(this._instant) / visits[idx]
      );
      const [_, intention] = categoricalSample(weights, intentions);

      nextIntentions[agentIdx][1] = intention;
    }

    return new JointIntention(nextIntentions);
  }

  private _createNode(jointIntention: JointIntention): Node {
    let minTimeToArrive = Number.POSITIVE_INFINITY;
    const minAgentIDS = new HashSet();
    const { movementDuration } = GameConfig.getInstance();

    for (const [id, state] of this.agentsStates.entries()) {
      let timeToArrive;
      if (state.terminated) {
        // for this agent we have just chosen a new intention

        const intention = jointIntention.get(id)!;
        if (intention === null) {
          // the agent is waiting indefinitely
          continue;
        }

        const distance = this._map.distance(state.position, intention.position);
        timeToArrive = movementDuration.multiply(distance);
      } else if (state.intention !== null) {
        // for this agent we have not chosen a new intention
        // since the agent has not completed its current intention, it means that it is moving
        // thus nextPosition is not null
        const distance =
          this._map.distance(state.nextPosition!, state.intention.position) +
          state.nextPosition!.manhattanDistance(state.position);

        timeToArrive = movementDuration.multiply(distance);
      } else {
        // the agent is waiting indefinitely
        continue;
      }

      if (timeToArrive.milliseconds === minTimeToArrive) {
        minAgentIDS.add(id);
      } else if (timeToArrive.milliseconds < minTimeToArrive) {
        minTimeToArrive = timeToArrive.milliseconds;
        minAgentIDS.clear();
        minAgentIDS.add(id);
      }
    }

    const newAvailablePositions = this._availablePositions.clone();
    // now we update the states
    const newAgentsStates = new HashMap<AgentID, AgentState>();
    for (const [id, state] of this.agentsStates.entries()) {
      if (state.terminated) {
        const intention = jointIntention.get(id)!;
        let carriedParcels =
          state.intention!.type === IntentionType.PUTDOWN ? [] : state.carriedParcels;

        if (intention === null) {
          // the agent is waiting indefinitely
          newAgentsStates.set(id, {
            position: state.position,
            nextPosition: null,
            carriedParcels,
            intention: null,
            terminated: false,
          });
        } else {
          if (intention.type === IntentionType.PICKUP) {
            newAvailablePositions.delete(intention.position);
          }

          if (minAgentIDS.has(id)) {
            // the agent is the first to arrive at its destination
            if (intention.type === IntentionType.PICKUP) {
              carriedParcels = [
                ...carriedParcels,
                ...this._beliefs.getParcelsByPosition(intention.position),
              ];
            }

            newAgentsStates.set(id, {
              position: intention.position,
              nextPosition: null,
              carriedParcels,
              intention,
              terminated: true,
            });
          } else {
            const nsteps = Math.floor(minTimeToArrive / movementDuration.milliseconds);
            const newFromPosition = this._map.computePosition(
              state.position,
              intention.position,
              nsteps
            );

            const newNextPosition = this._map.getNextPosition(
              newFromPosition,
              intention.position
            )[0];

            const offset = minTimeToArrive - nsteps * movementDuration.milliseconds;
            const percentage = offset / movementDuration.milliseconds;
            const newPosition = newFromPosition.interpolate(newNextPosition, percentage);

            newAgentsStates.set(id, {
              position: newPosition,
              nextPosition: newNextPosition,
              carriedParcels,
              intention,
              terminated: false,
            });
          }

          throw new Error('Not implemented');
        }
      } else if (state.intention !== null) {
        if (minAgentIDS.has(id)) {
          // the agent is the first to arrive at its destination
          let { carriedParcels } = state;
          if (state.intention.type === IntentionType.PICKUP) {
            carriedParcels = [
              ...carriedParcels,
              ...this._beliefs.getParcelsByPosition(state.intention.position),
            ];
          }

          newAgentsStates.set(id, {
            position: state.intention.position,
            nextPosition: null,
            carriedParcels,
            intention: state.intention,
            terminated: true,
          });
        } else {
          const toNext = state.position.manhattanDistance(state.nextPosition!);
          const timeRemaining = minTimeToArrive - toNext * movementDuration.milliseconds;

          const nsteps = Math.floor(timeRemaining / movementDuration.milliseconds);
          const newFromPosition = this._map.computePosition(
            state.nextPosition!,
            state.intention.position,
            nsteps
          );
          const newNextPosition = this._map.getNextPosition(
            newFromPosition,
            state.intention.position
          )[0];

          const offset = timeRemaining - nsteps * movementDuration.milliseconds;
          const percentage = offset / movementDuration.milliseconds;
          const newPosition = newFromPosition.interpolate(newNextPosition, percentage);

          newAgentsStates.set(id, {
            position: newPosition,
            nextPosition: newNextPosition,
            carriedParcels: state.carriedParcels,
            intention: state.intention,
            terminated: false,
          });
        }
      } else {
        // the agent is waiting indefinitely
        // so we do not need to update its state
        newAgentsStates.set(id, state);
      }
    }

    return new Node(
      this._beliefs,
      this._map,
      Instant.fromMilliseconds(this._instant.milliseconds + minTimeToArrive),
      newAvailablePositions,
      newAgentsStates
    );
  }
}
