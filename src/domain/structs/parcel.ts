//
//
//

import { Hashable, Instant } from "src/utils";
import { AgentID } from "./agent";
import { Position } from "./map";
import { DecayingValue } from "./value";

// ---------------------------------------------------------------------------
// ParcelID
// ---------------------------------------------------------------------------

export class ParcelID implements Hashable {
    private readonly _id: string;

    public constructor(id: string) {
        this._id = id;
    }

    public equals(other: ParcelID): boolean {
        return this._id === other._id;
    }

    public hash(): string {
        return this._id;
    }

    public toString(): string {
        return `ParcelID(${this._id})`;
    }

    public serialize(): string {
        return this._id;
    }

    public static deserialize(serialized: string): ParcelID {
        return new ParcelID(serialized);
    }
}

// ---------------------------------------------------------------------------
// Parcel
// ---------------------------------------------------------------------------

export class Parcel {
    public constructor(
        public readonly id: ParcelID,
        public readonly value: DecayingValue,
        public readonly position: Position,
        public readonly agentID: AgentID | null,
    ) {}

    public isExpired(): boolean {
        return this.value.getValueByInstant(Instant.now()) <= 0;
    }

    public toString(): string {
        return JSON.stringify(this, null, 2);
    }

    public serialize(): string {
        const obj = {
            id: this.id.serialize(),
            value: this.value.serialize(),
            position: this.position.serialize(),
            agentID: this.agentID?.serialize(),
        };

        return JSON.stringify(obj);
    }

    public static deserialize(serialized: string): Parcel {
        const obj = JSON.parse(serialized);
        return new Parcel(
            ParcelID.deserialize(obj.id),
            DecayingValue.deserialize(obj.value),
            Position.deserialize(obj.position),
            obj.agentID ? AgentID.deserialize(obj.agentID) : null,
        );
    }
}
