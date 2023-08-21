//
//
//

import { Socket, io } from 'socket.io-client';

import { Actuators, Messenger, Sensors } from 'src/logic/ports';
import {
  AgentID,
  Agent,
  GameConfig,
  DecayingValue,
  Direction,
  Parcel,
  ParcelID,
  Position,
  Tile,
  HelloMessage,
  serializeMessage,
  deserializeMessage,
  MergeRequestMessage,
  NewTeamMessage,
  StateMessage,
  ParcelUpdateMessage,
  AgentUpdateMessage,
  MessageType,
  ExecuteMessage,
} from 'src/logic/structs';

import { Duration, HashSet, Instant, sleep } from 'src/utils';

export class Client implements Actuators, Sensors, Messenger {
  private readonly _socket: Socket;

  private _agentPosition?: Position;

  private _agentID?: AgentID;

  private _crossableTiles?: Tile[];

  private _config?: GameConfig;

  public constructor(host: string, token: string) {
    this._socket = io(host, {
      extraHeaders: {
        'x-token': token,
      },
      autoConnect: true,
    });

    this._socket.on('you', this.setAgentInfo.bind(this));
    this._socket.once('map', this.setMap.bind(this));
    this._socket.once('config', this.setConfig.bind(this));
  }

  // ---------------------------------------------------------------------------
  // Attributes setters
  // ---------------------------------------------------------------------------

  private setAgentInfo(agent: any) {
    this._agentPosition = new Position(agent.x, agent.y);
    this._agentID = new AgentID(agent.id);
  }

  private setMap(_width: number, _height: number, tiles: any[]) {
    this._crossableTiles = tiles.map(
      (tile) => new Tile(new Position(tile.x, tile.y), tile.delivery, tile.parcelSpawner)
    );
  }

  private setConfig(config: any) {
    const parcelGenerationInterval =
      typeof config.PARCELS_GENERATION_INTERVAL === 'string'
        ? parseInt(config.PARCELS_GENERATION_INTERVAL.slice(0, -1), 10) * 1000
        : config.PARCELS_GENERATION_INTERVAL;

    const parcelRewardAverage =
      typeof config.PARCEL_REWARD_AVG === 'string'
        ? parseInt(config.PARCEL_REWARD_AVG, 10)
        : config.PARCEL_REWARD_AVG;

    const parcelRewardVariance =
      typeof config.PARCEL_REWARD_VARIANCE === 'string'
        ? parseInt(config.PARCEL_REWARD_VARIANCE, 10)
        : config.PARCEL_REWARD_VARIANCE;

    const parcelDecayingInterval =
      config.PARCEL_DECADING_INTERVAL.toLowerCase() === 'infinite'
        ? Infinity
        : parseInt(config.PARCEL_DECADING_INTERVAL.slice(0, -1), 10) * 1000;

    const movementSteps =
      typeof config.MOVEMENT_STEPS === 'string'
        ? parseInt(config.MOVEMENT_STEPS, 10)
        : config.MOVEMENT_STEPS;

    const movementDuration =
      typeof config.MOVEMENT_DURATION === 'string'
        ? parseInt(config.MOVEMENT_DURATION, 10)
        : config.MOVEMENT_DURATION;

    const parcelRadius = config.PARCELS_OBSERVATION_DISTANCE - 1;
    const agentRadius = config.AGENTS_OBSERVATION_DISTANCE - 1;

    let maxParcels =
      typeof config.PARCELS_MAX === 'string'
        ? parseInt(config.PARCELS_MAX, 10)
        : config.PARCELS_MAX;
    maxParcels = maxParcels === undefined ? Infinity : maxParcels;

    const randomAgents =
      typeof config.RANDOMLY_MOVING_AGENTS === 'string'
        ? parseInt(config.RANDOMLY_MOVING_AGENTS, 10)
        : config.RANDOMLY_MOVING_AGENTS;

    const randomAgentMovementDuration =
      typeof config.RANDOM_AGENT_SPEED === 'string'
        ? parseInt(config.RANDOM_AGENT_SPEED.slice(0 - 1), 10) * 1000
        : config.RANDOM_AGENT_SPEED * 1000;

    this._config = {
      parcelGenerationInterval,
      parcelRewardAverage,
      parcelRewardVariance,
      parcelDecayingInterval: Duration.fromMilliseconds(parcelDecayingInterval),
      movementSteps,
      movementDuration: Duration.fromMilliseconds(movementDuration),
      parcelRadius,
      agentRadius,
      maxParcels,
      randomAgents,
      randomAgentMovementDuration: Duration.fromMilliseconds(randomAgentMovementDuration),
    };
  }

  // ---------------------------------------------------------------------------
  // Invokable methods
  // ---------------------------------------------------------------------------

  public async getPosition(): Promise<Position> {
    while (this._agentPosition === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(Duration.fromMilliseconds(100));
    }

    return this._agentPosition;
  }

  public async getID(): Promise<AgentID> {
    while (this._agentID === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(Duration.fromMilliseconds(100));
    }

    return this._agentID;
  }

  public async getCrossableTiles(): Promise<Tile[]> {
    while (this._crossableTiles === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(Duration.fromMilliseconds(100));
    }

    return this._crossableTiles;
  }

  public async getConfig(): Promise<GameConfig> {
    while (this._config === undefined) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(Duration.fromMilliseconds(100));
    }

    return this._config;
  }

  public async move(direction: Direction): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('move', direction, (response: boolean | PromiseLike<boolean>) => {
        resolve(response);
      });
    });
  }

  public async pickup(): Promise<HashSet<ParcelID>> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('pickup', (response: any[]) => {
        const parcels: HashSet<ParcelID> = new HashSet<ParcelID>();
        for (const parcel of response) {
          parcels.add(new ParcelID(parcel.id));
        }

        resolve(parcels);
      });
    });
  }

  public async putdown(parcels: Parcel[] | null): Promise<HashSet<ParcelID>> {
    return new Promise((resolve, _reject) => {
      const ids = parcels !== null ? parcels.map((parcel) => parcel.id.toString()) : null;
      this._socket.emit('putdown', ids, (response: any[]) => {
        const putDownParcels: HashSet<ParcelID> = new HashSet<ParcelID>();
        for (const parcel of response) {
          putDownParcels.add(new ParcelID(parcel.id));
        }

        resolve(putDownParcels);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  public onParcelSensing(callback: (parcels: Parcel[]) => void): void {
    this._socket.on('parcels sensing', (parcels) => {
      const newParcels = [];
      for (const parcel of parcels) {
        newParcels.push(
          new Parcel(
            new ParcelID(parcel.id),
            new DecayingValue(parcel.reward, Instant.now()),
            new Position(parcel.x, parcel.y),
            parcel.carriedBy ? new AgentID(parcel.carriedBy) : null
          )
        );
      }

      if (newParcels.length > 0) {
        callback(newParcels);
      }
    });
  }

  public onPositionUpdate(callback: (position: Position) => void): void {
    this._socket.on('you', (agent) => {
      callback(new Position(agent.x, agent.y));
    });
  }

  public onAgentSensing(callback: (agents: Agent[]) => void): void {
    this._socket.on('agents sensing', (agents) => {
      const newAgents: Agent[] = [];
      for (const agent of agents) {
        if (Number.isInteger(agent.x) && Number.isInteger(agent.y)) {
          newAgents.push(
            new Agent(new AgentID(agent.id), new Position(agent.x, agent.y), agent.score)
          );
        }
      }

      if (newAgents.length > 0) {
        callback(newAgents);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Message sending
  // ---------------------------------------------------------------------------

  public async shoutHello(message: HelloMessage): Promise<void> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('shout', serializeMessage(message), () => {
        resolve();
      });
    });
  }

  public async askForMerge(id: AgentID, message: MergeRequestMessage): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      this._socket.emit(
        'ask',
        id.toString(),
        serializeMessage(message),
        (response: boolean | PromiseLike<boolean>) => {
          resolve(response);
        }
      );
    });
  }

  public async informAboutNewTeam(id: AgentID, message: NewTeamMessage): Promise<void> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('ask', id.toString(), serializeMessage(message), (_response: any) => {
        resolve();
      });
    });
  }

  public async informAboutState(id: AgentID, message: StateMessage): Promise<void> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('ask', id.toString(), serializeMessage(message), (_response: any) => {
        resolve();
      });
    });
  }

  public async informAboutParcelUpdate(id: AgentID, message: ParcelUpdateMessage): Promise<void> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('ask', id.toString(), serializeMessage(message), (_response: any) => {
        resolve();
      });
    });
  }

  public async informAboutAgentlUpdate(id: AgentID, message: AgentUpdateMessage): Promise<void> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('ask', id.toString(), serializeMessage(message), (_response: any) => {
        resolve();
      });
    });
  }

  public async askToExecute(id: AgentID, message: ExecuteMessage): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      this._socket.emit(
        'ask',
        id.toString(),
        serializeMessage(message),
        (response: boolean | PromiseLike<boolean>) => {
          resolve(response);
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Message receiving
  // ---------------------------------------------------------------------------

  public async onHelloMessage(
    callback: (id: AgentID, message: HelloMessage) => void
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.HELLO) {
        callback(new AgentID(id), message);
        if (reply) {
          // this should not happen for hello messages
          reply();
        }
      }
    });
  }

  public async onMergeRequestMessage(
    callback: (id: AgentID, message: MergeRequestMessage) => boolean
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.MERGE_REQUEST) {
        const response = callback(new AgentID(id), message);
        if (reply) {
          reply(response);
        }
      }
    });
  }

  public async onNewTeamMessage(
    callback: (id: AgentID, message: NewTeamMessage) => void
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.NEW_TEAM) {
        callback(new AgentID(id), message);
        if (reply) {
          reply();
        }
      }
    });
  }

  public async onStateMessage(
    callback: (id: AgentID, message: StateMessage) => void
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.STATE) {
        callback(new AgentID(id), message);
        if (reply) {
          reply();
        }
      }
    });
  }

  public async onParcelUpdateMessage(
    callback: (id: AgentID, message: ParcelUpdateMessage) => void
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.PARCEL_UPDATE) {
        callback(new AgentID(id), message);
        if (reply) {
          reply();
        }
      }
    });
  }

  public async onAgentUpdateMessage(
    callback: (id: AgentID, message: AgentUpdateMessage) => void
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.AGENT_UPDATE) {
        callback(new AgentID(id), message);
        if (reply) {
          reply();
        }
      }
    });
  }

  public async onExecuteMessage(
    callback: (id: AgentID, message: ExecuteMessage) => boolean
  ): Promise<void> {
    this._socket.on('msg', (id, _name, msg, reply) => {
      const message = deserializeMessage(msg);
      if (message.type === MessageType.EXECUTE) {
        const response = callback(new AgentID(id), message);
        if (reply) {
          reply(response);
        }
      }
    });
  }
}
