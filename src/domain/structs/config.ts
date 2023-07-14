//
//
//

export interface Config {
  readonly parcelGenerationInterval: number; // 2000

  readonly parcelRewardAverage: number; // 30

  readonly parcelRewardVariance: number; // 10

  readonly parcelDecayingInterval: number; // Infinity

  readonly movementSteps: number; // 1

  readonly movementDuration: number; // 500

  readonly parcelRadius: number; // 10

  readonly agentRadius: number; // 10

  readonly maxParcels: number; // Infinity

  readonly randomAgents: number; // 2

  readonly randomAgentMovementDuration: number; // 2000
}

export namespace Config {
  let _instance: Config | null = null;

  export function getInstance(): Config {
    if (_instance === null) {
      throw new Error('Config not initialized');
    }

    return _instance;
  }

  export function configure(config: Config): void {
    if (_instance !== null) {
      throw new Error('Config already initialized');
    }
    _instance = config;
  }
}
