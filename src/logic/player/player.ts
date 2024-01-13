//
//
//

import { GraphMap } from "src/logic/map";
import { Planner } from "src/logic/planner";
import { Actuators, Messenger, Sensors } from "src/logic/ports";
import {
    AgentID,
    AgentUpdateMessage,
    HelloMessage,
    MergeRequestMessage,
    MessageType,
    NewTeamMessage,
    Parcel,
    ParcelUpdateMessage,
    Position,
} from "src/logic/structs";
import { Duration, sleep } from "src/utils";
import { Cryptographer } from "src/utils/crypto";
import { BeliefSet } from "./beliefs";

export class Player {
    private readonly _id: AgentID;

    private readonly _map: GraphMap;

    private readonly _beliefs: BeliefSet;

    private readonly _actuators: Actuators;

    private readonly _messenger: Messenger;

    private readonly _planner: Planner;

    private readonly _cryptographer: Cryptographer;

    private readonly _helloMessageTimer: NodeJS.Timer;

    public constructor(
        id: AgentID,
        position: Position,
        map: GraphMap,
        sensors: Sensors,
        actuators: Actuators,
        messenger: Messenger,
    ) {
        this._id = id;
        this._map = map;
        this._beliefs = new BeliefSet(id, position, sensors);
        this._actuators = actuators;
        this._messenger = messenger;
        this._planner = new Planner(map, id, position);

        if (!process.env.KEY || !process.env.IV) {
            throw new Error("KEY or IV not set");
        }
        this._cryptographer = new Cryptographer(
            process.env.KEY,
            process.env.IV,
        );

        this._helloMessageTimer = setInterval(() => {
            this._messenger.shoutHello({
                type: MessageType.HELLO,
                secret: this._cryptographer.encrypt(this._id.serialize()),
            });
        }, 2000);

        this._messenger.onHelloMessage(this._onHelloMessage.bind(this));
        this._messenger.onMergeRequestMessage(this._onMergeRequest.bind(this));
        this._messenger.onNewTeamMessage(this._onNewTeamMessage.bind(this));
        this._messenger.onParcelUpdateMessage(
            this._onParcelUpdateMessage.bind(this),
        );
        this._messenger.onAgentUpdateMessage(
            this._onAgentUpdateMessage.bind(this),
        );

        this._beliefs.onParcelChange(this.informParcelUpdate.bind(this));
        this._beliefs.onAgentChange(this.informAgentUpdate.bind(this));
    }

    // eslint-disable-next-line class-methods-use-this
    public async start() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(Duration.fromMilliseconds(1000));
        }
    }

    // If hello message received by possible new leader, send merge request
    private async _onHelloMessage(id: AgentID, message: HelloMessage) {
        if (this._cryptographer.decrypt(message.secret) !== id.serialize()) {
            return;
        }

        if (this._beliefs.team.has(id) || this._id < id) {
            return;
        }

        await this._messenger.askForMerge(id, {
            type: MessageType.MERGE_REQUEST,
            secret: this._cryptographer.encrypt(this._id.serialize()),
            members: this._planner.agentsStates,
            parcels: this._planner.freeParcels,
            visibleAgents: this._planner.visibleAgents,
        });
        this._planner.stop();

        clearInterval(this._helloMessageTimer);
    }

    // Update beliefs based on merge request and send a new team message to all members
    private async _onMergeRequest(id: AgentID, message: MergeRequestMessage) {
        if (
            this._cryptographer.decrypt(message.secret) !== id.serialize() ||
            this._id > id
        ) {
            return;
        }

        for (const [memberID] of message.members) {
            this._beliefs.team.add(memberID);
        }

        const allMembers = [...this._beliefs.team.values()];
        for (const teamId of allMembers) {
            if (teamId === this._id) {
                continue;
            }

            await this._messenger.informAboutNewTeam(teamId, {
                type: MessageType.NEW_TEAM,
                secret: this._cryptographer.encrypt(this._id.serialize()),
                members: allMembers,
            });
        }

        this._planner.mergeTeams(
            message.members,
            message.parcels,
            message.visibleAgents,
        );
    }

    private _onNewTeamMessage(id: AgentID, message: NewTeamMessage): void {
        if (this._cryptographer.decrypt(message.secret) !== id.serialize()) {
            return;
        }

        this._beliefs.team.clear();
        for (const memberID of message.members) {
            this._beliefs.team.add(memberID);
        }
    }

    private _onParcelUpdateMessage(
        id: AgentID,
        message: ParcelUpdateMessage,
    ): void {
        if (!this._beliefs.team.has(id)) {
            return;
        }

        for (const parcel of message.newFreeParcels) {
            if (!this._beliefs.freeParcels.has(parcel.id)) {
                this._beliefs.freeParcels.set(parcel.id, parcel);
            }
        }

        for (const parcel of message.noLongerFreeParcels) {
            if (this._beliefs.freeParcels.has(parcel)) {
                this._beliefs.freeParcels.delete(parcel);
            }
        }

        for (const [parcelId, position] of message.changedPositionParcels) {
            const parcel = this._beliefs.freeParcels.get(parcelId);
            if (parcel) {
                this._beliefs.freeParcels.set(
                    parcelId,
                    new Parcel(
                        parcelId,
                        parcel.value,
                        position,
                        parcel.agentID,
                    ),
                );
            }
        }
    }

    private _onAgentUpdateMessage(
        id: AgentID,
        message: AgentUpdateMessage,
    ): void {
        if (!this._beliefs.team.has(id)) {
            return;
        }

        for (const agent of message.visibleAgents) {
            if (!this._beliefs.visibleAgents.has(agent.id)) {
                this._beliefs.visibleAgents.set(agent.id, agent);
            }
        }
    }

    public async informParcelUpdate(
        message: ParcelUpdateMessage,
    ): Promise<void> {
        const leader = [...this._beliefs.team.values()].sort()[0];
        if (leader === this._id) {
            return;
        }
        // console.log('informing leader about parcel update');
        await this._messenger.informAboutParcelUpdate(leader, message);
    }

    public async informAgentUpdate(message: AgentUpdateMessage): Promise<void> {
        const leader = [...this._beliefs.team.values()].sort()[0];
        if (leader === this._id) {
            return;
        }

        await this._messenger.informAboutAgentUpdate(leader, message);
    }
}
