//
//
//

import { Agent, Parcel, Position, VisibleAgent } from "src/domain/structs";

export interface Sensors {
    /**
     * Event that is triggered when at least one parcel is sensed.
     * @param callback The callback to call when parcels are sensed.
     */
    onParcelSensing(callback: (parcels: Parcel[]) => void): void;

    /**
     * Event that is triggered when the agent's position is updated.
     * @param callback The callback to call when the position is updated.
     */
    onPositionUpdate(callback: (position: Position) => void): void;

    /**
     * Event that is triggered when at least one agent is sensed.
     * @param callback The callback to call when agents are sensed.
     */
    onAgentSensing(callback: (agents: VisibleAgent[]) => void): void;
}
