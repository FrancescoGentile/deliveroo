//
//
//

import EventEmitter from "eventemitter3";
import { HashMap, HashSet } from "src/utils";
import { NotImplementedError } from "./errors";
import { GridMap } from "./map";
import { Agent, AgentID, Config, Parcel, ParcelID, Position } from "./structs";

export class Environment {
    public readonly map: GridMap;

    public readonly freeParcels: HashMap<ParcelID, Parcel> = new HashMap();

    public readonly visibleAgents: HashMap<AgentID, Agent> = new HashMap();

    private readonly _broker: EventEmitter = new EventEmitter();

    public constructor(map: GridMap) {
        this.map = map;
    }

    // -----------------------------------------------------------------------
    // Public methods
    // -----------------------------------------------------------------------

    public getParcelsByPosition(position: Position): Parcel[] {
        return Array.from(this.freeParcels.values()).filter((p) => p.position.equals(position));
    }

    public getParcelPositions(): Position[] {
        throw new NotImplementedError();
    }

    public getPromisingPositions(currentPosition: Position, k: number): [Position, number][] {
        throw new NotImplementedError();
    }

    public updateParcels(visibleParcels: Parcel[], currentPosition: Position) {
        const newFreeParcels: Parcel[] = [];
        const changedPositionParcels: Parcel[] = [];
        const noLongerFreeParcels: ParcelID[] = [];

        const { parcelRadius } = Config.getEnvironmentConfig();

        const visibleParcelIDs = new HashSet(visibleParcels.map((p) => p.id));
        for (const [id, parcel] of this.freeParcels.entries()) {
            if (parcel.isExpired()) {
                this.freeParcels.delete(id);
                continue;
            }

            const isVisibile = visibleParcelIDs.has(id);
            const shouldBeVisible =
                currentPosition.manhattanDistance(parcel.position) <= parcelRadius;

            if (!isVisibile && shouldBeVisible) {
                // If the parcel is not expired and it should be visibile but it is not,
                // then it means that the parcel was taken by another agent.
                this.freeParcels.delete(id);
                noLongerFreeParcels.push(id);
            }
        }

        for (const parcel of visibleParcels) {
            if (parcel.agentID === null) {
                // the parcel is free
                if (this.freeParcels.has(parcel.id)) {
                    const oldParcel = this.freeParcels.get(parcel.id)!;
                    if (!oldParcel.position.equals(parcel.position)) {
                        // the parcel has changed position
                        this.freeParcels.set(parcel.id, parcel);
                        changedPositionParcels.push(parcel);
                    }
                } else {
                    // the parcel is new
                    this.freeParcels.set(parcel.id, parcel);
                    newFreeParcels.push(parcel);
                }
            } else if (this.freeParcels.has(parcel.id)) {
                // the parcel is no longer free
                this.freeParcels.delete(parcel.id);
                noLongerFreeParcels.push(parcel.id);
            }
        }

        throw new NotImplementedError();
    }

    public updateAgents(visibleAgents: Agent[], currentPosition: Position) {
        throw new NotImplementedError();
    }

    // -----------------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------------
}
