//
//
//

import { Intention } from "./structs";

/**
 * Thrown when an intention is not supported.
 */
export class UnsupportedIntentionTypeError extends Error {
    public constructor(intention: Intention) {
        super(`Unsupported intention type: ${intention.type}.`);
    }
}

/**
 * Thrown when a method is not implemented.
 */
export class NotImplementedError extends Error {
    public constructor() {
        super("Not implemented.");
    }
}

/**
 * Thrown when the MCTS algorithm is not started.
 */
export class MCTSNotStartedError extends Error {
    public constructor() {
        super("MCTS not started.");
    }
}

export class UnknownMessageError extends Error {
    public constructor(message: any) {
        super(`Unknown message: ${message}.`);
    }
}

export class TeamMateNotFoundError extends Error {
    public constructor() {
        super("Team mate not found.");
    }
}
