//
//
//

import { UnknownMessageError } from "../errors";
import { Agent, AgentID, VisibleAgent } from "./agent";
import { Intention } from "./intentions";
import { Position } from "./map";
import { Parcel, ParcelID } from "./parcel";
import { AgentState } from "./state";

export enum MessageType {
    HELLO = "hello",
    POSITION_UPDATE = "position_update",
    PARCEL_SENSING = "parcel_sensing",
    AGENT_SENSING = "agent_sensing",
    INTENTION_UPDATE = "intention_update",
    IGNORE = "ignore",
}

export type Message =
    | HelloMessage
    | PositionUpdateMessage
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
    position: Position;
}

/**
 * Message sent by an agent to all agents in its team when it updates its position.
 */
export interface PositionUpdateMessage {
    type: MessageType.POSITION_UPDATE;
    position: Position;
}

/**
 * Message sent by an agent to all agents in its team when it senses parcels in
 * its vicinity.
 */
export interface ParcelSensingMessage {
    type: MessageType.PARCEL_SENSING;
    parcels: Parcel[];
}

/**
 * Message sent by an agent to all agents in its team when it senses other agents
 * in its vicinity.
 */
export interface AgentSensingMessage {
    type: MessageType.AGENT_SENSING;
    agents: VisibleAgent[];
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
                position: message.position.serialize(),
            });
        }
        case MessageType.POSITION_UPDATE: {
            return JSON.stringify({
                type: message.type,
                position: message.position.serialize(),
            });
        }
        case MessageType.PARCEL_SENSING: {
            return JSON.stringify({
                type: message.type,
                parcels: message.parcels.map((parcel) => parcel.serialize()),
            });
        }
        case MessageType.AGENT_SENSING: {
            return JSON.stringify({
                type: message.type,
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
                position: Position.deserialize(parsedMessage.position),
            };
        }
        case MessageType.POSITION_UPDATE: {
            return {
                type: MessageType.POSITION_UPDATE,
                position: Position.deserialize(parsedMessage.position),
            };
        }
        case MessageType.PARCEL_SENSING: {
            return {
                type: MessageType.PARCEL_SENSING,
                parcels: parsedMessage.parcels.map((parcel: any) => Parcel.deserialize(parcel)),
            };
        }
        case MessageType.AGENT_SENSING: {
            return {
                type: MessageType.AGENT_SENSING,
                agents: parsedMessage.agents.map((agent: any) => VisibleAgent.deserialize(agent)),
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
