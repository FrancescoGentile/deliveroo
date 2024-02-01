//
//
//

import { UnknownMessageError } from "../errors";
import { Agent, AgentID } from "./agent";
import { Intention } from "./intentions";
import { Position } from "./map";
import { Parcel, ParcelID } from "./parcel";
import { AgentState } from "./state";

export enum MessageType {
    HELLO = "hello",
    PARCEL_SENSING = "parcel_sensing",
    AGENT_SENSING = "agent_sensing",
    INTENTION_UPDATE = "intention_update",
    IGNORE = "ignore",
}

export type Message =
    | HelloMessage
    | ParcelSensingMessage
    | AgentSensingMessage
    | IntentionUpdateMessage
    | IgnoreMeMessage;

/**
 * Message periodically sent by an agent to all other agents to announce its
 * presence.
 */
export interface HelloMessage {
    type: MessageType.HELLO;
    ciphered_id: string;
}

/**
 * Message sent by an agent to all agents in its team when it senses parcels in
 * its vicinity.
 */
export interface ParcelSensingMessage {
    type: MessageType.PARCEL_SENSING;
    position: Position;
    nextPosition: Position | null;
    parcels: Parcel[];
}

/**
 * Message sent by an agent to all agents in its team when it senses other agents
 * in its vicinity.
 */
export interface AgentSensingMessage {
    type: MessageType.AGENT_SENSING;
    position: Position;
    nextPosition: Position | null;
    agents: Agent[];
}

/**
 * Message sent by an agent to all agents in its team when it updates its intentions.
 */
export interface IntentionUpdateMessage {
    type: MessageType.INTENTION_UPDATE;
    intentions: [Intention, number][];
}

/**
 * Message sent by an agent to all agents in its team whether it should be ignored
 * when planning.
 */
export interface IgnoreMeMessage {
    type: MessageType.IGNORE;
    ignore: boolean;
}

// ---------------------------------------------------------------------------
// Serialization and deserialization
// ---------------------------------------------------------------------------

export function serializeMessage(message: Message): string {
    switch (message.type) {
        case MessageType.HELLO: {
            return JSON.stringify({
                type: message.type,
                ciphered_id: message.ciphered_id,
            });
        }
        case MessageType.PARCEL_SENSING: {
            return JSON.stringify({
                type: message.type,
                position: message.position.serialize(),
                nextPosition: message.nextPosition?.serialize() ?? null,
                parcels: message.parcels.map((parcel) => parcel.serialize()),
            });
        }
        case MessageType.AGENT_SENSING: {
            return JSON.stringify({
                type: message.type,
                position: message.position.serialize(),
                nextPosition: message.nextPosition?.serialize() ?? null,
                agents: message.agents.map((agent) => agent.serialize()),
            });
        }
        case MessageType.INTENTION_UPDATE: {
            return JSON.stringify({
                type: message.type,
                intentions: message.intentions.map(([intention, weight]) => [
                    intention.serialize(),
                    weight,
                ]),
            });
        }
        case MessageType.IGNORE: {
            return JSON.stringify({
                type: message.type,
                ignore: message.ignore,
            });
        }
        default: {
            // This should never happen
            throw new UnknownMessageError(message);
        }
    }
}

export function deserializeMessage(message: string): Message {
    const parsedMessage = JSON.parse(message);
    if (typeof parsedMessage.type !== "string") {
        throw new UnknownMessageError(message);
    }

    switch (parsedMessage.type) {
        case MessageType.HELLO: {
            return {
                type: MessageType.HELLO,
                ciphered_id: parsedMessage.ciphered_id,
            };
        }
        case MessageType.PARCEL_SENSING: {
            return {
                type: MessageType.PARCEL_SENSING,
                position: Position.deserialize(parsedMessage.position),
                nextPosition: parsedMessage.nextPosition
                    ? Position.deserialize(parsedMessage.nextPosition)
                    : null,
                parcels: parsedMessage.parcels.map((parcel: any) => Parcel.deserialize(parcel)),
            };
        }
        case MessageType.AGENT_SENSING: {
            return {
                type: MessageType.AGENT_SENSING,
                position: Position.deserialize(parsedMessage.position),
                nextPosition: parsedMessage.nextPosition
                    ? Position.deserialize(parsedMessage.nextPosition)
                    : null,
                agents: parsedMessage.agents.map((agent: any) => Agent.deserialize(agent)),
            };
        }
        case MessageType.INTENTION_UPDATE: {
            return {
                type: MessageType.INTENTION_UPDATE,
                intentions: parsedMessage.intentions.map(([intention, weight]: [any, number]) => [
                    Intention.deserialize(intention),
                    weight,
                ]),
            };
        }
        case MessageType.IGNORE: {
            return {
                type: MessageType.IGNORE,
                ignore: parsedMessage.ignore,
            };
        }
        default: {
            throw new UnknownMessageError(message);
        }
    }
}
