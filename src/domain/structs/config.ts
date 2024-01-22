//
//
//

import { Duration } from "src/utils";

export interface EnvironmentConfig {
    readonly parcelRewardMean: number;
    readonly parcelRewardVariance: number;
    readonly parcelGenerationInterval: Duration;
    readonly parcelDecayingInterval: Duration;
    readonly movementDuration: Duration;
    readonly movementSteps: number;
    readonly parcelRadius: number;
    readonly agentRadius: number;
    readonly maxParcels: number;
    readonly numRandomAgents: number;
    readonly randomAgentMovementDuration: Duration;
}

export interface PlayerConfig {
    readonly secretKey: string;
    readonly secretSeed: string;
    readonly helloInterval: Duration;
    readonly maxLastHeard: Duration;
    readonly startIterations: number;
    readonly numPromisingPositions: number;
    readonly gaussianStd: number;
    readonly discountFactor: number;
}

export class Config {
    private static _instance?: Config;

    private readonly _environment: EnvironmentConfig;

    private readonly _player: PlayerConfig;

    private constructor(environment: EnvironmentConfig, player: PlayerConfig) {
        this._environment = environment;
        this._player = player;
    }

    public static init(environment: EnvironmentConfig, player: PlayerConfig) {
        if (Config._instance !== undefined) {
            throw new Error("Config already initialized.");
        }

        Config._instance = new Config(environment, player);
    }

    public static getInstance(): Config {
        if (Config._instance === undefined) {
            throw new Error("Config not initialized.");
        }

        return Config._instance;
    }

    public static getEnvironmentConfig(): EnvironmentConfig {
        return Config.getInstance()._environment;
    }

    public static getPlayerConfig(): PlayerConfig {
        return Config.getInstance()._player;
    }
}
