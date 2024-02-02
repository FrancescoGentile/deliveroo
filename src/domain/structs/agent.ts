//
//
//

import { Hashable } from "src/utils";
import { Position } from "./map";

export class AgentID implements Hashable {
    private readonly _id: string;

    public constructor(id: string) {
        this._id = id;
    }

    public equals(other: AgentID): boolean {
        return this._id === other._id;
    }

    public hash(): string {
        return this._id;
    }

    public toString(): string {
        return `AgentID(${this._id})`;
    }

    public serialize(): string {
        return this._id;
    }

    public static deserialize(serialized: string): AgentID {
        return new AgentID(serialized);
    }
}

export class VisibleAgent {
    public constructor(
        public readonly id: AgentID,
        public readonly position: Position,
        public readonly score: number,
    ) {}

    public serialize(): string {
        const obj = {
            id: this.id.serialize(),
            position: this.position.serialize(),
            score: this.score,
        };

        return JSON.stringify(obj);
    }

    public static deserialize(serialized: string): VisibleAgent {
        const obj = JSON.parse(serialized);
        return new VisibleAgent(
            AgentID.deserialize(obj.id),
            Position.deserialize(obj.position),
            obj.score,
        );
    }
}

/**
 * Information about an agent.
 */
export class Agent {
    public constructor(
        public readonly id: AgentID,
        public readonly position: Position,
        public readonly random: boolean,
    ) {}

    public toString(): string {
        return JSON.stringify(this, null, 2);
    }
}
