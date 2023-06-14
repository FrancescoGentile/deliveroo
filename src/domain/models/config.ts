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
}

export namespace Config {
  let _instance: Config | null = null;

  export function getInstance(): Config {
    if (_instance === null) {
      throw new Error('Config not initialized');
    }

    return _instance;
  }

  export class Builder {
    public static create(): Builder {
      if (_instance !== null) {
        throw new Error('Config already initialized');
      }

      return new Builder();
    }

    private _config: Config = {
      parcelGenerationInterval: 2000,
      parcelRewardAverage: 30,
      parcelRewardVariance: 10,
      parcelDecayingInterval: Infinity,
      movementSteps: 1,
      movementDuration: 500,
    };

    public withParcelGenerationInterval(
      parcelGenerationInterval: number
    ): Builder {
      this._config = {
        ...this._config,
        parcelGenerationInterval,
      };
      return this;
    }

    public withParcelRewardAverage(parcelRewardAverage: number): Builder {
      this._config = {
        ...this._config,
        parcelRewardAverage,
      };
      return this;
    }

    public withParcelRewardVariance(parcelRewardVariance: number): Builder {
      this._config = {
        ...this._config,
        parcelRewardVariance,
      };
      return this;
    }

    public withParcelDecayingInterval(parcelDecayingInterval: number): Builder {
      this._config = {
        ...this._config,
        parcelDecayingInterval,
      };
      return this;
    }

    public withMovementSteps(movementSteps: number): Builder {
      this._config = {
        ...this._config,
        movementSteps,
      };
      return this;
    }

    public withMovementDuration(movementDuration: number): Builder {
      this._config = {
        ...this._config,
        movementDuration,
      };
      return this;
    }

    public build(): Config {
      _instance = this._config;
      return this._config;
    }
  }
}
