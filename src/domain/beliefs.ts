//
//
//

import EventEmitter from "eventemitter3";
import { HashMap, HashSet, Instant, kmax } from "src/utils";
import { TeamMateNotFoundError } from "./errors";
import { GridMap } from "./map";
import { Agent, AgentID, Config, Intention, Parcel, ParcelID, Position, Tile } from "./structs";

export interface TeamMate {
    position: Position;
    lastHeard: Instant;
    intentions: [Intention, number][];
}

export class BeliefSet {
    public readonly map: GridMap;

    public readonly myID: AgentID;

    // map each position associated to the index of the position in the array
    // of position weights
    private readonly _positionToIdx: HashMap<Position, number> = new HashMap();

    private readonly _positionWeights: number[];

    private readonly _freeParcels: HashMap<ParcelID, Parcel> = new HashMap();

    private readonly _positionToParcelIDs: HashMap<Position, ParcelID[]> = new HashMap();

    private readonly _teamMates: HashMap<AgentID, TeamMate> = new HashMap();

    private readonly _agents: HashMap<AgentID, Agent> = new HashMap();

    private readonly _visibleAgents: Agent[] = [];

    private readonly _broker: EventEmitter = new EventEmitter();

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    public constructor(map: GridMap, id: AgentID) {
        this.map = map;
        this.myID = id;

        for (const [idx, tile] of map.tiles.entries()) {
            this._positionToIdx.set(tile.position, idx);
        }
        this._positionWeights = _getPositionWeights(map.tiles, this._positionToIdx);

        setInterval(() => this._removeDeadParcels(), 10000);
    }

    // ------------------------------------------------------------------------
    // Parcel management
    // ------------------------------------------------------------------------

    /**
     * Returns the parcel with the given ID. Only parcels that are currently free
     * are returned.
     *
     * @param id The ID of the parcel.
     *
     * @returns The parcel with the given ID, or undefined if the parcel is not
     * free or it does not exist.
     */
    public getParcelByID(id: ParcelID): Parcel | undefined {
        return this._freeParcels.get(id);
    }

    /**
     * Returns the parcels that are in the given position.
     *
     * @param position The position to check.
     *
     * @returns The parcels that are in the given position.
     */
    public getParcelsByPosition(position: Position): Parcel[] {
        const parcels = this._positionToParcelIDs
            .get(position)
            ?.map((id) => this._freeParcels.get(id)!);

        return parcels ?? [];
    }

    /**
     * Returns the positions where there are parcels.
     *
     * @returns The positions where there are parcels.
     */
    public getParcelPositions(): Position[] {
        return Array.from(this._positionToParcelIDs.keys());
    }

    public updateParcels(visibleParcels: Parcel[], currentPosition: Position) {
        const newFreeParcels: ParcelID[] = [];
        const changedPositionParcels: [ParcelID, Position, Position][] = [];
        const noLongerFreeParcels: [ParcelID, Position][] = [];

        const { parcelRadius } = Config.getEnvironmentConfig();

        const visibleParcelIDs = new HashSet(visibleParcels.map((p) => p.id));
        for (const [id, parcel] of this._freeParcels.entries()) {
            if (parcel.isExpired()) {
                this._removeParcel(id);
                continue;
            }

            const isVisibile = visibleParcelIDs.has(id);
            const shouldBeVisible =
                currentPosition.manhattanDistance(parcel.position) <= parcelRadius;

            if (!isVisibile && shouldBeVisible) {
                // If the parcel is not expired and it should be visibile but it is not,
                // then it means that the parcel was taken by another agent.
                this._removeParcel(id);
                noLongerFreeParcels.push([id, parcel.position]);
            }
        }

        for (const parcel of visibleParcels) {
            if (parcel.agentID === null) {
                // the parcel is free
                if (this._freeParcels.has(parcel.id)) {
                    const oldPosition = this._freeParcels.get(parcel.id)!.position;
                    if (!oldPosition.equals(parcel.position)) {
                        // the parcel has changed position
                        this._changeParcelPosition(parcel.id, parcel.position);
                        changedPositionParcels.push([parcel.id, oldPosition, parcel.position]);
                    }
                } else {
                    // the parcel is new
                    this._freeParcels.set(parcel.id, parcel);
                    const parcelsInPosition = this._positionToParcelIDs.get(parcel.position);
                    if (parcelsInPosition === undefined) {
                        this._positionToParcelIDs.set(parcel.position, [parcel.id]);
                    } else {
                        parcelsInPosition.push(parcel.id);
                    }

                    newFreeParcels.push(parcel.id);
                }
            } else if (this._freeParcels.has(parcel.id)) {
                // the parcel is no longer free
                this._removeParcel(parcel.id);
                if (!parcel.agentID.equals(this.myID)) {
                    noLongerFreeParcels.push([parcel.id, parcel.position]);
                }
            }
        }

        if (
            newFreeParcels.length > 0 ||
            changedPositionParcels.length > 0 ||
            noLongerFreeParcels.length > 0
        ) {
            this._broker.emit(
                "parcels-change",
                newFreeParcels,
                changedPositionParcels,
                noLongerFreeParcels,
            );
        }
    }

    // ------------------------------------------------------------------------
    // Agent management
    // ------------------------------------------------------------------------

    public getVisibleAgents(): Agent[] {
        return [];
    }

    public updateAgents(visibleAgents: Agent[], currentPosition: Position) {
        // TODO: implement
    }

    // ------------------------------------------------------------------------
    // Team management
    // ------------------------------------------------------------------------

    public isTeamMate(agentID: AgentID): boolean {
        return this._teamMates.has(agentID);
    }

    public getTeamMate(agentID: AgentID): TeamMate {
        const teamMate = this._teamMates.get(agentID);
        if (teamMate === undefined) {
            throw new TeamMateNotFoundError();
        }

        return teamMate;
    }

    public getTeamMates(): [AgentID, TeamMate][] {
        return [...this._teamMates.entries()];
    }

    public addTeamMate(agentID: AgentID) {
        if (this._teamMates.has(agentID)) {
            throw new Error("Agent already in the team.");
        }

        this._teamMates.set(agentID, {
            position: new Position(0, 0), // Here we can use any position since it will be updated later.
            lastHeard: Instant.now(),
            intentions: [],
        });
    }

    public removeTeamMate(agentID: AgentID) {
        if (!this._teamMates.has(agentID)) {
            throw new TeamMateNotFoundError();
        }

        this._teamMates.delete(agentID);
    }

    public updateTeamMateActivity(agentID: AgentID) {
        const teamMate = this._teamMates.get(agentID);
        if (teamMate === undefined) {
            throw new TeamMateNotFoundError();
        }

        teamMate.lastHeard = Instant.now();
    }

    public updateTeamMatePosition(agentID: AgentID, position: Position) {
        const teamMate = this._teamMates.get(agentID);
        if (teamMate === undefined) {
            throw new TeamMateNotFoundError();
        }

        teamMate.position = position;
        teamMate.lastHeard = Instant.now();
    }

    public updateTeamMateIntentions(agentID: AgentID, intentions: [Intention, number][]) {
        const teamMate = this._teamMates.get(agentID);
        if (teamMate === undefined) {
            throw new TeamMateNotFoundError();
        }

        teamMate.intentions = intentions;
        teamMate.lastHeard = Instant.now();
    }

    // ------------------------------------------------------------------------
    // Other public methods
    // ------------------------------------------------------------------------

    /**
     * Computes the positions that have an hypothetical high value and are thus worth exploring.
     * The hypothetical value of a position is high if it is close to spawn points and far from
     * the current position of the agents (including the current agent).
     *
     * @param currentPosition The current position of the agent.
     * @param k The number of positions to return.
     *
     * @returns The best positions and their hypothetical value (not sorted)
     */
    public getPromisingPositions(currentPosition: Position, k: number): [Position, number][] {
        const weights = [...this._positionWeights];
        const agentsPositions = [...this._visibleAgents.map((a) => a.position), currentPosition];

        const { agentRadius, parcelRewardMean } = Config.getEnvironmentConfig();
        const { gaussianStd } = Config.getPlayerConfig();

        for (const position of agentsPositions) {
            for (let i = -agentRadius; i <= agentRadius; i += 1) {
                for (let j = -agentRadius; j <= agentRadius; j += 1) {
                    const level = Math.abs(i) + Math.abs(j);
                    if (level > agentRadius) {
                        continue;
                    }

                    const pos = new Position(position.row + i, position.column + j);
                    const idx = this._positionToIdx.get(pos);
                    if (idx === undefined) {
                        continue;
                    }

                    weights[idx] -= Math.exp(-(i * i + j * j) / (2 * gaussianStd * gaussianStd));
                }
            }
        }

        const [values, indexes] = kmax(weights, k);
        return values.map((v, i) => [this.map.tiles[indexes[i]].position, v * parcelRewardMean]);
    }

    // ------------------------------------------------------------------------
    // Event listeners
    // ------------------------------------------------------------------------

    public onParcelsChange(
        callback: (
            newFreeParcels: ParcelID[],
            changedPositionParcels: [ParcelID, Position, Position][],
            noLongerFreeParcels: [ParcelID, Position][],
        ) => void,
    ) {
        this._broker.on("parcels-change", callback);
    }

    // ------------------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------------------

    private _removeDeadParcels() {
        for (const [id, parcel] of this._freeParcels.entries()) {
            if (parcel.isExpired()) {
                this._removeParcel(id);
            }
        }
    }

    private _removeParcel(id: ParcelID) {
        const parcel = this._freeParcels.get(id);
        if (parcel === undefined) {
            throw new Error("Parcel not found.");
        }

        const parcelsInPosition = this._positionToParcelIDs.get(parcel.position);
        if (parcelsInPosition === undefined) {
            throw new Error("Parcel not found in position.");
        }

        const idx = parcelsInPosition.findIndex((p) => p.equals(id));
        if (idx === -1) {
            throw new Error("Parcel not found in position.");
        }

        parcelsInPosition.splice(idx, 1);

        if (parcelsInPosition.length === 0) {
            this._positionToParcelIDs.delete(parcel.position);
        }

        this._freeParcels.delete(id);
    }

    private _changeParcelPosition(id: ParcelID, newPosition: Position) {
        const parcel = this._freeParcels.get(id);
        if (parcel === undefined) {
            throw new Error("Parcel not found.");
        }

        const oldPosition = parcel.position;
        if (oldPosition.equals(newPosition)) {
            return;
        }

        this._freeParcels.set(id, new Parcel(id, parcel.value, newPosition, parcel.agentID));

        const parcelsInOldPosition = this._positionToParcelIDs.get(oldPosition);
        if (parcelsInOldPosition === undefined) {
            throw new Error("Parcel not found in position.");
        }
        const idx = parcelsInOldPosition.findIndex((p) => p.equals(id));
        if (idx === -1) {
            throw new Error("Parcel not found in position.");
        }
        parcelsInOldPosition.splice(idx, 1);

        const parcelsInNewPosition = this._positionToParcelIDs.get(newPosition);
        if (parcelsInNewPosition === undefined) {
            this._positionToParcelIDs.set(newPosition, [id]);
        } else {
            parcelsInNewPosition.push(id);
        }
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function _getPositionWeights(tiles: Tile[], positionToIdx: HashMap<Position, number>): number[] {
    const weights = new Array(tiles.length).fill(0);

    const { parcelRadius } = Config.getEnvironmentConfig();
    const { gaussianStd } = Config.getPlayerConfig();

    for (const tile of tiles) {
        if (!tile.spawn) {
            continue;
        }

        for (let i = -parcelRadius; i <= parcelRadius; i += 1) {
            for (let j = -parcelRadius; j <= parcelRadius; j += 1) {
                const level = Math.abs(i) + Math.abs(j);
                if (level > parcelRadius) {
                    continue;
                }

                const pos = new Position(tile.position.row + i, tile.position.column + j);
                const idx = positionToIdx.get(pos);
                if (idx === undefined) {
                    continue;
                }

                weights[idx] += Math.exp(-(i * i + j * j) / (2 * gaussianStd * gaussianStd));
            }
        }
    }

    return weights;
}
