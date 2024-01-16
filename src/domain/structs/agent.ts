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

/**
 * Information about an agent.
 */
export class Agent {
    public constructor(
        public readonly id: AgentID,
        public position: Position,
        public score: number,
    ) {}

    public toString(): string {
        return JSON.stringify(this, null, 2);
    }

    public serialize(): string {
        const obj = {
            id: this.id.serialize(),
            position: this.position.serialize(),
            score: this.score,
        };

        return JSON.stringify(obj);
    }

    public static deserialize(serialized: string): Agent {
        const obj = JSON.parse(serialized);
        return new Agent(
            AgentID.deserialize(obj.id),
            Position.deserialize(obj.position),
            obj.score,
        );
    }
}
