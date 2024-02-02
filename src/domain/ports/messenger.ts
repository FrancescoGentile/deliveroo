//
//
//

import {
    AgentID,
    AgentSensingMessage,
    HelloMessage,
    IgnoreMeMessage,
    IntentionUpdateMessage,
    ParcelSensingMessage,
    PositionUpdateMessage,
} from "src/domain/structs";

export interface Messenger {
    /**
     * Sends an hello message to all agents in the environment, even if they are not visible.
     *
     * @param message
     */
    shoutHelloMessage(message: HelloMessage): Promise<void>;

    /**
     * Sends a position update message to the agent with the given ID.
     *
     * @param id The ID of the agent to send the message to.
     * @param message The message to send.
     */
    sendPositionUpdateMessage(id: AgentID, message: PositionUpdateMessage): Promise<void>;

    /**
     * Sends a parcel sensing message to the agent with the given ID.
     *
     * @param id The ID of the agent to send the message to.
     * @param message The message to send.
     */
    sendParcelSensingMessage(id: AgentID, message: ParcelSensingMessage): Promise<void>;

    /**
     * Sends an agent sensing message to the agent with the given ID.
     *
     * @param id The ID of the agent to send the message to.
     * @param message The message to send.
     */
    sendAgentSensingMessage(id: AgentID, message: AgentSensingMessage): Promise<void>;

    /**
     * Sends an intention update message to the agent with the given ID.
     *
     * @param id The ID of the agent to send the message to.
     * @param message The message to send.
     */
    sendIntentionUpdateMessage(id: AgentID, message: IntentionUpdateMessage): Promise<void>;

    /**
     * Sends an ignore me message to the agent with the given ID.
     *
     * @param id The ID of the agent to send the message to.
     * @param message The message to send.
     */
    sendIgnoreMeMessage(id: AgentID, message: IgnoreMeMessage): Promise<void>;

    /**
     * Registers a callback to be called when a hello message is received.
     *
     * @param callback The callback to register.
     */
    onHelloMessage(callback: (sender: AgentID, message: HelloMessage) => void): void;

    /**
     * Registers a callback to be called when a position update message is received.
     *
     * @param callback The callback to register.
     */
    onPositionUpdateMessage(
        callback: (sender: AgentID, message: PositionUpdateMessage) => void,
    ): void;

    /**
     * Registers a callback to be called when a parcel sensing message is received.
     *
     * @param callback The callback to register.
     */
    onParcelSensingMessage(
        callback: (sender: AgentID, message: ParcelSensingMessage) => void,
    ): void;

    /**
     * Registers a callback to be called when an agent sensing message is received.
     *
     * @param callback The callback to register.
     */
    onAgentSensingMessage(callback: (sender: AgentID, message: AgentSensingMessage) => void): void;

    /**
     * Registers a callback to be called when an intention update message is received.
     *
     * @param callback The callback to register.
     */
    onIntentionUpdateMessage(
        callback: (sender: AgentID, message: IntentionUpdateMessage) => void,
    ): void;

    /**
     * Registers a callback to be called when an ignore message is received.
     *
     * @param callback The callback to register.
     */
    onIgnoreMeMessage(callback: (sender: AgentID, message: IgnoreMeMessage) => void): void;
}
