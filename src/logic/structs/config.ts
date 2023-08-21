//
//
//

import { Duration } from 'src/utils';

export interface GameConfig {
  readonly parcelRewardAverage: number; // 30

  readonly parcelRewardVariance: number; // 10

  readonly parcelGenerationInterval: Duration; // 2000

  readonly parcelDecayingInterval: Duration; // Infinity

  readonly movementDuration: Duration; // 500

  readonly movementSteps: number; // 1

  readonly parcelRadius: number; // 10

  readonly agentRadius: number; // 10

  readonly maxParcels: number; // Infinity

  readonly randomAgents: number; // 2

  readonly randomAgentMovementDuration: Duration; // 2000
}

export namespace GameConfig {
  let _instance: GameConfig | null = null;

  export function getInstance(): GameConfig {
    if (_instance === null) {
      throw new Error('GameConfig not initialized.');
    }

    return _instance;
  }

  export function configure(config: GameConfig): void {
    if (_instance !== null) {
      throw new Error('GameConfig already initialized.');
    }
    _instance = config;
  }
}
