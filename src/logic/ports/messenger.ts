//
//
//

import {
  AgentID,
  ExecuteMessage,
  HelloMessage,
  MergeRequestMessage,
  NewTeamMessage,
  StateMessage,
  ParcelUpdateMessage,
  AgentUpdateMessage,
} from 'src/logic/structs';

export interface Messenger {
  /**
   * Sends a message to all agents in the environment, even if they are not visible.
   * However, this method does not guarantee that the message will be received by all agents.
   * @param message The message to send.
   */
  shoutHello(message: HelloMessage): Promise<void>;

  /**
   * Sends a merge request to the leader of the given team.
   * @param id The ID of the leader of the team to send the merge request to.
   * @param message The merge request to send.
   * @returns Whether the merge request was accepted.
   */
  askForMerge(id: AgentID, message: MergeRequestMessage): Promise<boolean>;

  /**
   * Informs an agent about the new team it has been assigned to.
   * @param id The ID of the agent to inform.
   * @param message The new members message to send.
   * @returns Whether the message was received.
   */
  informAboutNewTeam(id: AgentID, message: NewTeamMessage): Promise<void>;

  /**
   * Informs the leader of the given team about the current state of the environment.
   * @param id The ID of the leader of the team to inform.
   * @param message The state message to send.
   * @returns Whether the message was received.
   */
  informAboutState(id: AgentID, message: StateMessage): Promise<void>;

  /**
   * Informs the leader of the given team about changes in the environment.
   * @param id The ID of the leader of the team to inform.
   * @param message The update message to send.
   * @returns Whether the message was received.
   */
  informAboutParcelUpdate(id: AgentID, message: ParcelUpdateMessage): Promise<void>;

  /**
   * Informs the leader of the given team about changes in the environment.
   * @param id The ID of the leader of the team to inform.
   * @param message The update message to send.
   * @returns Whether the message was received.
   */
  informAboutAgentlUpdate(id: AgentID, message: AgentUpdateMessage): Promise<void>;

  /**
   * Asks an agent to execute an action.
   * @param id The ID of the agent to ask.
   * @param message The execute message to send.
   * @returns Whether the message was received and the action was executed successfully.
   */
  askToExecute(id: AgentID, message: ExecuteMessage): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Message receiving events
  // ---------------------------------------------------------------------------

  /**
   * Event that is triggered when an hello message is received.
   * @param callback The callback to call when an hello message is received.
   */
  onHelloMessage(callback: (id: AgentID, message: HelloMessage) => void): void;

  /**
   * Event that is triggered when a merge request message is received.
   * @param callback The callback to call when a merge request message is received.
   */
  onMergeRequestMessage(callback: (id: AgentID, message: MergeRequestMessage) => boolean): void;

  /**
   * Event that is triggered when a new team message is received.
   * @param callback The callback to call when a new team message is received.
   */
  onNewTeamMessage(callback: (id: AgentID, message: NewTeamMessage) => void): void;

  /**
   * Event that is triggered when a state message is received.
   * @param callback The callback to call when a state message is received.
   * @returns The callback to call when a state message is received.
   */
  onStateMessage(callback: (id: AgentID, message: StateMessage) => void): void;

  /**
   * Event that is triggered when an update message is received.
   * @param callback The callback to call when an update message is received.
   */
  onParcelUpdateMessage(callback: (id: AgentID, message: ParcelUpdateMessage) => void): void;

  /**
   * Event that is triggered when an update message is received.
   * @param callback The callback to call when an update message is received.
   */
  onAgentUpdateMessage(callback: (id: AgentID, message: AgentUpdateMessage) => void): void;

  /**
   * Event that is triggered when an execute message is received.
   * @param callback The callback to call when an execute message is received.
   */
  onExecuteMessage(callback: (id: AgentID, message: ExecuteMessage) => boolean): void;
}
