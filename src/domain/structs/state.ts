//
//
//

import { Intention } from "./intentions";
import { Position } from "./map";
import { Parcel } from "./parcel";

/**
 * The state of an agent.
 */
export class AgentState {
    public constructor(
        public position: Position,
        public nextPosition: Position | null,
        public carriedParcels: Parcel[],
        public intention: Intention | null,
        public terminated: boolean,
    ) {}

    public serialize(): string {
        return JSON.stringify({
            position: this.position.serialize(),
            nextPosition: this.nextPosition?.serialize() ?? null,
            carriedParcels: this.carriedParcels.map((parcel) => parcel.serialize()),
            intention: this.intention?.serialize() ?? null,
            terminated: this.terminated,
        });
    }

    public static deserialize(serialized: string): AgentState {
        const parsed = JSON.parse(serialized);
        return new AgentState(
            Position.deserialize(parsed.position),
            parsed.nextPosition ? Position.deserialize(parsed.nextPosition) : null,
            parsed.carriedParcels.map((parcel: string) => Parcel.deserialize(parcel)),
            parsed.intention ? Intention.deserialize(parsed.intention) : null,
            parsed.terminated,
        );
    }
}
