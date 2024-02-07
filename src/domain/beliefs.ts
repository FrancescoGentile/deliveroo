//
//
//

import { MinPriorityQueue } from "@datastructures-js/priority-queue";
import EventEmitter from "eventemitter3";
import { Duration, HashMap, HashSet, Instant, kmax } from "src/utils";
import { TeamMateNotFoundError } from "./errors";
import { GridMap } from "./map";
import {
    Agent,
    AgentID,
    Config,
    DecayingValue,
    Direction,
    Intention,
    Parcel,
    ParcelID,
    Position,
    Tile,
    VisibleAgent,
} from "./structs";

export interface TeamMate {
    position: Position;
    lastHeard: Instant;
    intentions: [Intention, number][];
    ignore: boolean;
}

interface AgentInfo {
    id: AgentID;
    random: boolean;
    firstSeen: Instant;
    firstScore: number;
}

export class BeliefSet {
    public readonly map: GridMap;

    public readonly myID: AgentID;

    private _position: Position;
    public get myPosition(): Position {
        return this._position;
    }

    // map each position associated to the index of the position in the array
    // of position weights
    private readonly _positionToIdx: HashMap<Position, number> = new HashMap();

    private readonly _positionWeights: number[];

    private readonly _freeParcels: HashMap<ParcelID, Parcel> = new HashMap();

    private readonly _positionToParcel: HashMap<Position, ParcelID[]> = new HashMap();

    private readonly _teamMates: HashMap<AgentID, TeamMate> = new HashMap();

    // agents here refers to the agents that are not team mates
    private readonly _agents: HashMap<AgentID, AgentInfo> = new HashMap();

    private readonly _agentToPosition: HashMap<AgentID, [Position, Instant]> = new HashMap();

    private readonly _positionToAgent: HashMap<Position, AgentID> = new HashMap();

    private readonly _broker: EventEmitter = new EventEmitter();

    private readonly _ignoredParcels: HashSet<ParcelID> = new HashSet();

    public parcelDiscounts: HashMap<ParcelID, number> = new HashMap();

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    public constructor(map: GridMap, id: AgentID, position: Position) {
        this.map = map;
        this.myID = id;
        this._position = position;

        for (const [idx, tile] of map.tiles.entries()) {
            this._positionToIdx.set(tile.position, idx);
        }
        this._positionWeights = _getPositionWeights(map, this._positionToIdx);

        const { movementDuration } = Config.getEnvironmentConfig();

        setInterval(() => this._removeExpiredParcels(), 10000);
        setInterval(() => this._removeDisappearedTeamMates(), 1000);
        setInterval(() => this._removeMovedAgents(), movementDuration.milliseconds);
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
        const parcels = this._positionToParcel
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
        return Array.from(this._positionToParcel.keys());
    }

    /**
     * Updates the set of free parcels and emits a "parcels-change" event.
     *
     * @param parcels The parcels seen by the agent.
     * @param viewer The agent that saw the parcels (it can be a team mate or the player).
     */
    public updateParcels(parcels: Parcel[], viewer: AgentID) {
        let currentPosition: Position;
        if (viewer.equals(this.myID)) {
            currentPosition = this._position;
        } else {
            const mate = this.getTeamMate(viewer);
            currentPosition = mate.position;
        }

        const visibleParcels = parcels.filter((p) =>
            this.map.isReachable(this._position, p.position),
        );

        const newFreeParcels: ParcelID[] = [];
        const changedPositionParcels: [ParcelID, Position, Position][] = [];
        const noLongerFreeParcels: [ParcelID, Position, DecayingValue][] = [];
        const expiredParcels: [ParcelID, Position, DecayingValue][] = [];

        const { parcelRadius } = Config.getEnvironmentConfig();

        const visibleParcelIDs = new HashSet(visibleParcels.map((p) => p.id));
        for (const [id, parcel] of this._freeParcels.entries()) {
            if (parcel.isExpired()) {
                this._removeParcel(id);
                expiredParcels.push([id, parcel.position, parcel.value]);
                continue;
            }

            const isVisibile = visibleParcelIDs.has(id);
            const shouldBeVisible =
                currentPosition.manhattanDistance(parcel.position) <= parcelRadius;

            if (!isVisibile && shouldBeVisible) {
                // If the parcel is not expired and it should be visibile but it is not,
                // then it means that the parcel was taken by another agent.
                this._removeParcel(id);
                noLongerFreeParcels.push([id, parcel.position, parcel.value]);
            }
        }

        for (const parcel of visibleParcels) {
            if (this._ignoredParcels.has(parcel.id)) {
                continue;
            }

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
                    const parcelsInPosition = this._positionToParcel.get(parcel.position);
                    if (parcelsInPosition === undefined) {
                        this._positionToParcel.set(parcel.position, [parcel.id]);
                    } else {
                        parcelsInPosition.push(parcel.id);
                    }

                    newFreeParcels.push(parcel.id);
                }
            } else if (this._freeParcels.has(parcel.id)) {
                // the parcel is no longer free
                this._removeParcel(parcel.id);
                if (!parcel.agentID.equals(this.myID)) {
                    noLongerFreeParcels.push([parcel.id, parcel.position, parcel.value]);
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

        if (expiredParcels.length > 0) {
            this._broker.emit("expired-parcels", expiredParcels);
        }
    }

    public addIgnoredParcels(parcels: ParcelID[]) {
        for (const parcelId of parcels) {
            this._ignoredParcels.add(parcelId);
            if (this._freeParcels.has(parcelId)) {
                throw new Error("I can only ignore parcels that are not free.");
            }
        }

        console.log("Ignored parcels:", this._ignoredParcels);
    }

    // ------------------------------------------------------------------------
    // Agent management
    // ------------------------------------------------------------------------

    /**
     * Updates the position of the player and emits a "my-position-change" event.
     *
     * @param position The new position of the agent.
     */
    public updateMyPosition(position: Position) {
        this._position = position;
        this._broker.emit("my-position-change", position);
    }

    /**
     * Returns the positions that are currently occupied by agents.
     *
     * @param include_teammates Whether to include the positions of the team mates.
     * @param include_myself Whether to include the position of the player.
     */
    public getOccupiedPositions(include_teammates = true, include_myself = false): Position[] {
        const positions = [];

        for (const [pos, id] of this._positionToAgent.entries()) {
            positions.push(pos);
            // console.log(`Agent ${id} at position ${pos}`);
        }

        if (include_teammates) {
            for (const { position } of this._teamMates.values()) {
                positions.push(position);
            }
        }

        if (include_myself) {
            positions.push(this._position);
        }

        return positions;
    }

    /**
     * Returns the agents occupying the positions in the environment.
     *
     * @param include_teammates Whether to include the team mates.
     * @param include_myself Whether to include the player.
     */
    public getAgents(include_teammates = true, include_myself = false): Agent[] {
        const agents = [];
        for (const [id, [position]] of this._agentToPosition.entries()) {
            const agent = this._agents.get(id)!;
            agents.push(new Agent(id, position, agent.random));
        }

        if (include_teammates) {
            for (const [id, { position }] of this._teamMates.entries()) {
                agents.push(new Agent(id, position, false));
            }
        }

        if (include_myself) {
            agents.push(new Agent(this.myID, this._position, false));
        }

        return agents;
    }

    /**
     * Returns whether the given position is occupied by an agent.
     * If the position corresponds to the position of a team mate, then
     * it is considered occupied. If the position is occupied by the agent
     * itself, then it is not considered occupied.
     */
    public isPositionOccupied(position: Position): boolean {
        if (this._positionToAgent.has(position)) {
            return true;
        }

        for (const { position: pos } of this._teamMates.values()) {
            if (pos.equals(position)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Updates the set of occupied positions and emits an "occupied-positions-change" event.
     *
     * @param agents The agents seen by the agent.
     * @param viewer The agent that saw the agents (it can be a team mate or the player).
     */
    public updateAgents(agents: VisibleAgent[], viewer: AgentID) {
        const now = Instant.now();
        const { maxParcels, movementDuration, parcelRewardMean, agentRadius } =
            Config.getEnvironmentConfig();

        let currentPosition: Position;
        if (viewer.equals(this.myID)) {
            currentPosition = this._position;
        } else {
            const mate = this.getTeamMate(viewer);
            currentPosition = mate.position;
        }

        // Do not consider the visible agents who are team mates (including the player itself)
        // or who can never interact with the player.
        const visibleAgents = agents.filter((a) => {
            if (a.id.equals(this.myID) || this._teamMates.has(a.id)) {
                return false;
            }

            return this.map.isReachable(this._position, a.position);
        });

        const visibleOccupiedPositions = new HashMap<Position, AgentID>();
        for (const agent of visibleAgents) {
            visibleOccupiedPositions.set(agent.position, agent.id);
        }

        let changed = false;
        for (const [oldAgentID, [position, lastSeen]] of this._agentToPosition.entries()) {
            if (visibleOccupiedPositions.has(position)) {
                // The position is still occupied by an agent
                const newAgentID = visibleOccupiedPositions.get(position)!;
                this._positionToAgent.set(position, newAgentID);
                this._agentToPosition.set(newAgentID, [position, now]);
                continue;
            }
            const distance = currentPosition.manhattanDistance(position);
            if (distance <= agentRadius) {
                // The viewer can see the position and it is not occupied by an agent
                this._positionToAgent.delete(position);
                this._agentToPosition.delete(oldAgentID);
                changed = true;
            } else if (position.equals(currentPosition)) {
                // The position is the same as the current position of the viewer,
                // so it cannot be occupied by an agent.
                this._positionToAgent.delete(position);
                this._agentToPosition.delete(oldAgentID);
            } else if (this._hasProbablyMoved(oldAgentID, lastSeen, now)) {
                // The viewer cannot see the position, so we assume it is free if enough time has passed
                // since an agent was last seen in that position.
                this._positionToAgent.delete(position);
                this._agentToPosition.delete(oldAgentID);
                changed = true;
            } else if (
                distance > agentRadius &&
                !this._hasProbablyMoved(oldAgentID, lastSeen, now)
            ) {
                // The agent just moved to a position that the viewer cannot see so we need to remove the
                // agent from the previous position
                this._positionToAgent.delete(position);
                this._agentToPosition.delete(oldAgentID);
            } else {
                throw new Error("This should never happen.");
            }
        }

        const avgParcelsDistance = this.map.tiles.length / maxParcels;
        for (const agent of visibleAgents) {
            if (!this._positionToAgent.has(agent.position)) {
                this._positionToAgent.set(agent.position, agent.id);
                this._agentToPosition.set(agent.id, [agent.position, now]);
                changed = true;
            }

            if (this._agents.has(agent.id)) {
                // We previously knew about the agent, so we check if it is a random agent.
                const info = this._agents.get(agent.id)!;
                const visitedTiles =
                    now.subtract(info.firstSeen).milliseconds / movementDuration.milliseconds;
                const numSmartAgents = this._teamMates.size + 1;
                const avgScore =
                    ((visitedTiles / avgParcelsDistance) * parcelRewardMean) / numSmartAgents;

                info.random = avgScore > agent.score - info.firstScore;
            } else {
                // We did not know about the agent, so we add it to the set of agents.
                // For now, we assume that the agent is not random.
                const info: AgentInfo = {
                    id: agent.id,
                    random: false,
                    firstSeen: now,
                    firstScore: agent.score,
                };
                this._agents.set(agent.id, info);
            }
        }

        // console.log("Occupied positions:");
        // this._positionToAgent.forEach((id, pos) => {
        //     console.log(`Agent ${id} at position ${pos}`);
        // });
        if (changed) {
            this._broker.emit("occupied-positions-change");
        }
    }

    // ------------------------------------------------------------------------
    // Team management
    // ------------------------------------------------------------------------

    /**
     * Returns whether the given agent is a team mate.
     *
     * @param agentID The ID of the agent.
     */
    public isTeamMate(agentID: AgentID): boolean {
        return this._teamMates.has(agentID);
    }

    /**
     * Returns the team mate with the given ID.
     *
     * @param agentID The ID of the agent.
     *
     * @returns The team mate with the given ID.
     *
     * @throws {TeamMateNotFoundError} If the agent is not a team mate.
     */
    public getTeamMate(agentID: AgentID): TeamMate {
        const teamMate = this._teamMates.get(agentID);
        if (teamMate === undefined) {
            throw new TeamMateNotFoundError();
        }

        return teamMate;
    }

    /**
     * Returns the team mates of the agent.
     */
    public getTeamMates(): [AgentID, TeamMate][] {
        return [...this._teamMates.entries()];
    }

    public addTeamMate(agentID: AgentID, position: Position) {
        if (this._teamMates.has(agentID)) {
            throw new Error("Agent already in the team.");
        }

        this._teamMates.set(agentID, {
            position,
            lastHeard: Instant.now(),
            intentions: [],
            ignore: false,
        });

        let changed: boolean;
        if (this._agents.has(agentID)) {
            // We previously knew about the agent but it was not a team mate.
            this._agents.delete(agentID);

            if (this._agentToPosition.has(agentID)) {
                const [pos] = this._agentToPosition.get(agentID)!;
                this._agentToPosition.delete(agentID);
                this._positionToAgent.delete(pos);
                // The set of occupied positions is changed only if the team mate is in a different position
                // than the agent was.
                changed = !pos.equals(position);
            } else {
                // We did not know the position of the agent, but now we do.
                changed = true;
            }
        } else if (this._positionToAgent.has(position)) {
            // The position was occupied by an agent, but now it is occupied by a team mate,
            // so we need to remove the agent from the position. The set of occupied positions
            // however is not changed because the position is still occupied.
            const id = this._positionToAgent.get(position)!;
            this._positionToAgent.delete(position);
            this._agentToPosition.delete(id);
            changed = false;
        } else {
            // the position was free, but now it is occupied by a team mate
            changed = true;
        }

        if (changed) {
            this._broker.emit("occupied-positions-change");
        }
    }

    public removeTeamMate(mateID: AgentID) {
        if (!this._teamMates.has(mateID)) {
            throw new TeamMateNotFoundError();
        }

        this._teamMates.delete(mateID);
    }

    public updateTeamMateActivity(mateID: AgentID) {
        const teamMate = this.getTeamMate(mateID);
        teamMate.lastHeard = Instant.now();
    }

    public updateTeamMatePosition(mateID: AgentID, position: Position) {
        const teamMate = this.getTeamMate(mateID);
        teamMate.lastHeard = Instant.now();

        const oldPosition = teamMate.position;
        teamMate.position = position;

        let changed: boolean;
        if (oldPosition.equals(position)) {
            changed = false;
        } else if (this._positionToAgent.has(position)) {
            const id = this._positionToAgent.get(position)!;
            this._positionToAgent.delete(position);
            this._agentToPosition.delete(id);
            // The set of occupied position is not changed because the position is still occupied.
            changed = false;
        } else {
            changed = true;
        }

        if (changed) {
            this._broker.emit("occupied-positions-change");
        }
    }

    public updateTeamMateIntentions(mateID: AgentID, intentions: [Intention, number][]) {
        const teamMate = this.getTeamMate(mateID);
        teamMate.intentions = intentions;
        teamMate.lastHeard = Instant.now();
    }

    public updateTeamMateIgnore(mateID: AgentID, ignore: boolean) {
        const teamMate = this._teamMates.get(mateID);
        if (teamMate === undefined) {
            throw new TeamMateNotFoundError();
        }

        teamMate.ignore = ignore;
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
        const agentsPositions = this.getOccupiedPositions(true, true);

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

                    if (level <= 1) {
                        weights[idx] = 0;
                    } else {
                        const factor = Math.exp(-(i * i + j * j) / (2 * gaussianStd * gaussianStd));
                        weights[idx] *= 1 - factor;
                    }
                }
            }
        }

        const reachableWeights = weights.map((w, i) => {
            const tile = this.map.tiles[i];
            if (this.map.isReachable(currentPosition, tile.position)) {
                return w;
            }
            return 0;
        });
        const [values, indexes] = kmax(reachableWeights, k);
        return values
            .map(
                (v, i) =>
                    [this.map.tiles[indexes[i]].position, v * parcelRewardMean] as [
                        Position,
                        number,
                    ],
            )
            .filter((v) => v[1] > 0);
    }

    /**
     * Computes the bottleneck between start and end.
     * The bottleneck is the set of positions that must necessarily be crossed
     * to go from start to end.
     *
     * @param start The starting position.
     * @param end The ending position.
     *
     * @returns The bottleneck between start and end.
     */
    public computeBottleneck(start: Position, end: Position): HashSet<Position> {
        const bottleneck = new HashSet<Position>();

        let currentPosition = start;
        while (!currentPosition.equals(end)) {
            bottleneck.add(currentPosition);
            const nextPositions = this.map.getNextPosition(currentPosition, end);

            if (nextPositions.length === 0) {
                throw new Error("No path exists");
            }

            if (nextPositions.length > 1) {
                break;
            }

            [currentPosition] = nextPositions;
        }

        currentPosition = end;
        while (!currentPosition.equals(start)) {
            if (bottleneck.has(currentPosition)) {
                break;
            }

            bottleneck.add(currentPosition);
            const nextPositions = this.map.getNextPosition(currentPosition, start);
            if (nextPositions.length === 0) {
                throw new Error("No path exists");
            }

            if (nextPositions.length > 1) {
                break;
            }

            [currentPosition] = nextPositions;
        }

        return bottleneck;
    }

    /**
     * Computes the shortest path from start to end taking into account the
     * current state of the environment.
     *
     * @param start The starting position.
     * @param end The ending position.
     *
     * @returns The shortest path from start to end or null if no path exists.
     */
    public recomputePath(start: Position, end: Position): Direction[] | null {
        const positions = new HashSet<Position>(this.map.tiles.map((t) => t.position));

        for (const position of this.getOccupiedPositions()) {
            positions.delete(position);
        }

        const frontier = new MinPriorityQueue<[Position, number]>((v) => v[1]);

        frontier.enqueue([start, 0]);
        const cameFrom = new HashMap<Position, Position | null>();
        const costSoFar = new HashMap<Position, number>();
        cameFrom.set(start, null);
        costSoFar.set(start, 0);

        while (frontier.size() > 0) {
            const current = frontier.dequeue()[0];

            if (current.equals(end)) {
                break;
            }

            for (const next of this.map.adjacent(current)) {
                if (!positions.has(next)) {
                    continue;
                }

                const newCost = costSoFar.get(current)! + 1;
                if (!costSoFar.has(next) || newCost < costSoFar.get(next)!) {
                    costSoFar.set(next, newCost);
                    const priority = newCost + this.map.distance(next, end);
                    frontier.enqueue([next, priority]);
                    cameFrom.set(next, current);
                }
            }
        }

        if (!cameFrom.has(end)) {
            return null;
        }

        const path: Direction[] = [];
        let current = end;
        while (!current.equals(start)) {
            const previous = cameFrom.get(current)!;
            path.push(previous.directionTo(current));
            current = previous;
        }

        return path.reverse();
    }

    // ------------------------------------------------------------------------
    // Event listeners
    // ------------------------------------------------------------------------

    /**
     * Registers a callback that is called when the position of the agent changes.
     *
     * @param callback The callback to register.
     */
    public onMyPositionChange(callback: (position: Position) => void) {
        this._broker.on("my-position-change", callback);
    }

    /**
     * Registers a callback that is called when the set of free parcels changes.
     *
     * @param callback The callback to register.
     */
    public onParcelsChange(
        callback: (
            newFreeParcels: ParcelID[],
            changedPositionParcels: [ParcelID, Position, Position][],
            noLongerFreeParcels: [ParcelID, Position, DecayingValue][],
        ) => void,
    ) {
        this._broker.on("parcels-change", callback);
    }

    /**
     * Registers a callback that is called when new parcels expire.
     *
     * @param callback The callback to register.
     */
    public onExpiredParcels(callback: (parcels: [ParcelID, Position, DecayingValue][]) => void) {
        this._broker.on("expired-parcels", callback);
    }

    /**
     * Registers a callback that is called when the set of occupied positions changes.
     *
     * @param callback The callback to register.
     */
    public onOccupiedPositionsChange(callback: () => void) {
        this._broker.on("occupied-positions-change", callback);
    }

    // ------------------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------------------

    private _removeExpiredParcels() {
        for (const id of this._ignoredParcels.values()) {
            this._ignoredParcels.delete(id);
        }

        const expiredParcels: [ParcelID, Position, DecayingValue][] = [];
        for (const [id, parcel] of this._freeParcels.entries()) {
            if (parcel.isExpired()) {
                expiredParcels.push([id, parcel.position, parcel.value]);
                this._removeParcel(id);
            }
        }

        if (expiredParcels.length > 0) {
            this._broker.emit("expired-parcels", expiredParcels);
        }
    }

    private _removeParcel(id: ParcelID) {
        const parcel = this._freeParcels.get(id);
        if (parcel === undefined) {
            throw new Error("Parcel not found.");
        }

        const parcelsInPosition = this._positionToParcel.get(parcel.position);
        if (parcelsInPosition === undefined) {
            throw new Error("Parcel not found in position.");
        }

        const idx = parcelsInPosition.findIndex((p) => p.equals(id));
        if (idx === -1) {
            throw new Error("Parcel not found in position.");
        }

        parcelsInPosition.splice(idx, 1);

        if (parcelsInPosition.length === 0) {
            this._positionToParcel.delete(parcel.position);
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

        const parcelsInOldPosition = this._positionToParcel.get(oldPosition);
        if (parcelsInOldPosition === undefined) {
            throw new Error("Parcel not found in position.");
        }
        const idx = parcelsInOldPosition.findIndex((p) => p.equals(id));
        if (idx === -1) {
            throw new Error("Parcel not found in position.");
        }
        parcelsInOldPosition.splice(idx, 1);

        const parcelsInNewPosition = this._positionToParcel.get(newPosition);
        if (parcelsInNewPosition === undefined) {
            this._positionToParcel.set(newPosition, [id]);
        } else {
            parcelsInNewPosition.push(id);
        }
    }

    private _removeDisappearedTeamMates() {
        const now = Instant.now();
        const { maxLastHeard } = Config.getPlayerConfig();

        for (const [id, mate] of this._teamMates.entries()) {
            if (now.subtract(mate.lastHeard).milliseconds > maxLastHeard.milliseconds) {
                this._teamMates.delete(id);
            }
        }
    }

    private _removeMovedAgents() {
        const now = Instant.now();

        let changed = false;
        for (const [id, [position, lastSeen]] of this._agentToPosition.entries()) {
            if (this._hasProbablyMoved(id, lastSeen, now)) {
                this._agentToPosition.delete(id);
                this._positionToAgent.delete(position);
                changed = true;
            }
        }

        if (changed) {
            this._broker.emit("occupied-positions-change");
        }
    }

    private _hasProbablyMoved(agentID: AgentID, lastSeen: Instant, now: Instant): boolean {
        const { movementDuration, randomAgentMovementDuration } = Config.getEnvironmentConfig();

        const agent = this._agents.get(agentID)!;

        const timePassed = now.subtract(lastSeen);
        let maxTimeToPass: Duration;
        if (agent.random) {
            maxTimeToPass = randomAgentMovementDuration;
        } else {
            maxTimeToPass = movementDuration;
        }

        return timePassed.milliseconds > maxTimeToPass.milliseconds;
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function _getPositionWeights(map: GridMap, positionToIdx: HashMap<Position, number>): number[] {
    const weights = new Array(map.tiles.length).fill(0);

    const { parcelRadius } = Config.getEnvironmentConfig();
    const { gaussianStd } = Config.getPlayerConfig();

    for (const tile of map.tiles) {
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
                if (!map.isReachable(tile.position, pos)) {
                    continue;
                }

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
