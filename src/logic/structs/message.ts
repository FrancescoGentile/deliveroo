//
//
//

import { Agent, AgentID } from './agent';
import { Position } from './env';
import { Intention } from './intentions';
import { Parcel, ParcelID } from './parcel';
import { AgentState } from './state';

export enum MessageType {
  HELLO = 'hello',
  MERGE_REQUEST = 'merge request',
  NEW_TEAM = 'new team',
  STATE = 'state',
  PARCEL_UPDATE = 'parcel update',
  AGENT_UPDATE = 'agent update',
  EXECUTE = 'execute',
}

// TODO: StateMessage inside MergeRequestMessage

export type Message =
  | HelloMessage
  | MergeRequestMessage
  | NewTeamMessage
  | ParcelUpdateMessage
  | AgentUpdateMessage
  | ExecuteMessage;

/**
 * Message periodically shouted by a team leader to inform any existing agents about the team.
 * If an agent receives this message, three things can happen:
 * 1. If the agent is the leader of a team (note that a team can consist of a single agent)
 * and the message comes from a possible new leader (i.e. its ID is lower than the agent's ID),
 * the agent should send a `MergeRequestMessage` to the other agent.
 * 2. If the agent is the leader of a team and the message comes from a possible new member
 * (i.e. its ID is greater than the agent's ID), the agent should do nothing. In this case,
 * indeed, the other agent will send a `MergeRequestMessage` in response to the `HelloMessage`
 * periodically sent by this leader.
 * 3. If the agent is not the leader of a team, the agent should do nothing.
 */
export interface HelloMessage {
  type: MessageType.HELLO;
  secret: string;
}

/**
 * Message sent by a team leader to the leader of another team to request to merge the two teams.
 * The sending leader should send this message only if the ID of the receiving leader is lower than its ID,
 * that is, if the receiving leader would be the new leader of the merged team.
 */
export interface MergeRequestMessage {
  type: MessageType.MERGE_REQUEST;
  secret: string;
  members: [AgentID, AgentState][];
  parcels: Parcel[];
  visibleAgents: Agent[];
}

/**
 * Message sent by the new leader of a merged team to all the members of the merged teams to inform them
 * of the creation of the new team and of the new team members.
 */
export interface NewTeamMessage {
  type: MessageType.NEW_TEAM;
  secret: string;
  members: AgentID[];
}

export interface ParcelUpdateMessage {
  type: MessageType.PARCEL_UPDATE;
  newFreeParcels: Parcel[];
  changedPositionParcels: [ParcelID, Position][];
  noLongerFreeParcels: ParcelID[];
}

export interface AgentUpdateMessage {
  type: MessageType.AGENT_UPDATE;
  visibleAgents: Agent[];
}

export interface ExecuteMessage {
  type: MessageType.EXECUTE;
  newIntention: Intention | null;
  nextIntention: Intention | null;
}

// ---------------------------------------------------------------------------
// Serialization and deserialization
// ---------------------------------------------------------------------------

export function serializeMessage(message: Message): string {
  switch (message.type) {
    case MessageType.HELLO: {
      return JSON.stringify(message);
    }
    case MessageType.MERGE_REQUEST: {
      return JSON.stringify({
        ...message,
        members: message.members.map(([id, state]) => [id.serialize(), state.serialize()]),
        parcels: message.parcels.map((parcel) => parcel.serialize()),
        visibleAgents: message.visibleAgents.map((agent) => agent.serialize()),
      });
    }
    case MessageType.NEW_TEAM: {
      return JSON.stringify({
        ...message,
        members: message.members.map((member) => member.serialize()),
      });
    }
    case MessageType.PARCEL_UPDATE: {
      return JSON.stringify({
        type: message.type,
        newFreeParcels: message.newFreeParcels.map((parcel) => parcel.serialize()),
        changedPositionParcels: message.changedPositionParcels.map(([parcel, position]) => [
          parcel.serialize(),
          position.serialize(),
        ]),
        noLongerFreeParcels: message.noLongerFreeParcels.map((parcel) => parcel.serialize()),
      });
    }
    case MessageType.AGENT_UPDATE: {
      return JSON.stringify({
        type: message.type,
        newAgents: message.visibleAgents.map((agent) => agent.serialize()),
      });
    }
    case MessageType.EXECUTE: {
      return JSON.stringify({
        type: message.type,
        newIntention: message.newIntention?.serialize() ?? null,
        nextIntention: message.nextIntention?.serialize() ?? null,
      });
    }
    default: {
      // This should never happen
      throw new Error(`Unknown message: ${message}`);
    }
  }
}

export function deserializeMessage(message: string): Message {
  const parsedMessage = JSON.parse(message);
  switch (parsedMessage.type) {
    case MessageType.HELLO: {
      return parsedMessage;
    }
    case MessageType.MERGE_REQUEST: {
      return {
        ...parsedMessage,
        members: parsedMessage.members.map(([id, state]: [string, string]) => [
          AgentID.deserialize(id),
          AgentState.deserialize(state),
        ]),
        parcels: parsedMessage.parcels.map((parcel: string) => Parcel.deserialize(parcel)),
        visibleAgents: parsedMessage.visibleAgents.map((agent: string) => Agent.deserialize(agent)),
      };
    }
    case MessageType.NEW_TEAM: {
      return {
        ...parsedMessage,
        members: parsedMessage.members.map((member: string) => AgentID.deserialize(member)),
      };
    }
    case MessageType.STATE: {
      return {
        ...parsedMessage,
        parcels: parsedMessage.parcels.map((parcel: string) => Parcel.deserialize(parcel)),
        agents: parsedMessage.agents.map((agent: string) => Agent.deserialize(agent)),
      };
    }
    case MessageType.PARCEL_UPDATE: {
      return {
        type: parsedMessage.type,
        newFreeParcels: parsedMessage.newFreeParcels.map((parcel: string) =>
          Parcel.deserialize(parcel)
        ),
        changedPositionParcels: parsedMessage.changedPositionParcels.map(
          ([parcel, position]: [string, string]) => [
            Parcel.deserialize(parcel),
            Position.deserialize(position),
          ]
        ),
        noLongerFreeParcels: parsedMessage.noLongerFreeParcels.map((parcel: string) =>
          Parcel.deserialize(parcel)
        ),
      };
    }
    case MessageType.AGENT_UPDATE: {
      return {
        type: parsedMessage.type,
        visibleAgents: parsedMessage.newAgents.map((agent: string) => Agent.deserialize(agent)),
      };
    }
    case MessageType.EXECUTE: {
      return {
        type: parsedMessage.type,
        newIntention: parsedMessage.newIntention
          ? Intention.deserialize(parsedMessage.newIntention)
          : null,
        nextIntention: parsedMessage.nextIntention
          ? Intention.deserialize(parsedMessage.nextIntention)
          : null,
      };
    }
    default: {
      // This should never happen
      throw new Error(`Unknown message: ${message}`);
    }
  }
}
