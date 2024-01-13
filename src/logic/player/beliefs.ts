//
//
//

import EventEmitter from "eventemitter3";
import { Sensors } from "src/logic/ports";
import {
    Agent,
    AgentID,
    AgentUpdateMessage,
    GameConfig,
    MessageType,
    Parcel,
    ParcelID,
    ParcelUpdateMessage,
    Position,
} from "src/logic/structs";
import { HashMap, HashSet } from "src/utils";

export class BeliefSet {
    public position: Position;

    public readonly team: HashSet<AgentID> = new HashSet();

    private readonly _freeParcels: HashMap<ParcelID, Parcel> = new HashMap();

    private readonly _visibleAgents: HashMap<AgentID, Agent> = new HashMap();

    private readonly _broker: EventEmitter = new EventEmitter();

    public constructor(id: AgentID, position: Position, sensors: Sensors) {
        this.position = position;
        this.team.add(id);

        // add event handlers
        sensors.onParcelSensing(this._onParcelSensing.bind(this));
        sensors.onAgentSensing(this._onAgentSensing.bind(this));
        sensors.onPositionUpdate(this._onPositionUpdate.bind(this));
    }

    public get freeParcels(): HashMap<ParcelID, Parcel> {
        return this._freeParcels;
    }

    public get visibleAgents(): HashMap<AgentID, Agent> {
        return this._visibleAgents;
    }

    // ---------------------------------------------------------------------------
    // Event handlers
    // ---------------------------------------------------------------------------

    private _onPositionUpdate(newPosition: Position) {
        this.position = newPosition;
    }

    private _onParcelSensing(visibleParcels: Parcel[]) {
        const newFreeParcels: Parcel[] = [];
        const changedPositionParcels: [ParcelID, Position][] = [];
        const noLongerFreeParcels: ParcelID[] = [];

        const { parcelRadius } = GameConfig.getInstance();

        const visibleParcelsIDs = new Set(visibleParcels.map((p) => p.id));
        for (const [id, parcel] of this._freeParcels.entries()) {
            const isVisible = visibleParcelsIDs.has(id);
            const isAlive = parcel.isAlive();
            const shouldBeVisible =
                parcel.position.manhattanDistance(this.position) <=
                parcelRadius;

            if (!isAlive) {
                this._freeParcels.delete(id);
            } else if (!isVisible && shouldBeVisible) {
                // If the parcel is not dead and it should be visible, but it is not
                // then, it means that the parcel was taken by another agent.
                // Note that we cannot check here if the parcel was taken by an agent in our team,
                // thus it will be the global planner that will check this.

                this._freeParcels.delete(id);
                noLongerFreeParcels.push(id);
            }
        }

        for (const parcel of visibleParcels) {
            if (parcel.agentID === null) {
                // the parcel is free
                if (this._freeParcels.has(parcel.id)) {
                    // the parcel was already free
                    const oldParcel = this._freeParcels.get(parcel.id)!;
                    if (!oldParcel.position.equals(parcel.position)) {
                        // the parcel has changed position
                        changedPositionParcels.push([
                            parcel.id,
                            parcel.position,
                        ]);
                        this._freeParcels.set(parcel.id, parcel);
                    }
                } else {
                    // the parcel is new
                    newFreeParcels.push(parcel);
                    this._freeParcels.set(parcel.id, parcel);
                }
            } else if (
                this._freeParcels.has(parcel.id) &&
                !this.team.has(parcel.agentID)
            ) {
                // the parcel is no longer free and it has been taken by an agent not in our team
                noLongerFreeParcels.push(parcel.id);
                this._freeParcels.delete(parcel.id);
            }
        }

        if (
            newFreeParcels.length > 0 ||
            changedPositionParcels.length > 0 ||
            noLongerFreeParcels.length > 0
        ) {
            const message: ParcelUpdateMessage = {
                type: MessageType.PARCEL_UPDATE,
                newFreeParcels,
                changedPositionParcels,
                noLongerFreeParcels,
            };
            this._broker.emit("parcel-change", message);
        }
    }

    private _onAgentSensing(agents: Agent[]) {
        let changed = false;

        // Check if there are new agents
        for (const agent of agents) {
            if (!this._visibleAgents.has(agent.id)) {
                changed = true;
            }

            this._visibleAgents.set(agent.id, agent);
        }

        // Check if there are agents that are no longer visible
        for (const [id, _] of this._visibleAgents.entries()) {
            if (!agents.some((a) => a.id === id)) {
                changed = true;
                this._visibleAgents.delete(id);
            }
        }

        if (changed) {
            const message: AgentUpdateMessage = {
                type: MessageType.AGENT_UPDATE,
                visibleAgents: agents,
            };
            this._broker.emit("agent-change", message);
        }
    }

    // ---------------------------------------------------------------------------
    // Event senders
    // ---------------------------------------------------------------------------

    public onParcelChange(callback: (message: ParcelUpdateMessage) => void) {
        this._broker.on("parcel-change", callback);
    }

    public onAgentChange(callback: (message: AgentUpdateMessage) => void) {
        this._broker.on("agent-change", callback);
    }
}
