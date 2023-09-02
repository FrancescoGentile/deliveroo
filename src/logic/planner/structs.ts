//
//
//

import { HashMap, Hashable } from 'src/utils';
import { AgentID, Intention, Utility } from '../structs';

export interface AgentPotentialIntentions {
  // the potential intentions that the agent can execute
  intentions: [Intention, ...Intention[], null];
  // the utilities that the agent can achieve from executing the intentions
  utilities: Utility[];
  // the number of times the agent has tried each intention
  visits: number[];
}

export class JointIntention implements Hashable {
  private readonly _intentions: HashMap<AgentID, Intention | null>;

  public constructor(intentions: [AgentID, Intention | null][]) {
    this._intentions = new HashMap();
    for (const [agentID, intention] of intentions) {
      this._intentions.set(agentID, intention);
    }
  }

  public hash(): string {
    return [...this._intentions.entries()]
      .map(([id, intention]) => `${id.hash()}:${intention?.hash()}`)
      .join(',');
  }

  public get(agentID: AgentID): (Intention | null) | undefined {
    return this._intentions.get(agentID);
  }

  public entries(): IterableIterator<[AgentID, Intention | null]> {
    return this._intentions.entries();
  }
}
