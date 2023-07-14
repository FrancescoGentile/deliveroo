//
//
//

import winston, { createLogger, Logger } from 'winston';

import { Environment } from 'src/domain/environment';
import { Actuators } from 'src/domain/ports';
import { sleep } from 'src/utils';
import {
  Config,
  Intention,
  PickUpIntention,
  Position,
  PutDownIntention,
} from 'src/domain/structs';
import { MonteCarloPlanner } from './planner';
import { PDDLPlanner } from './pddlPlanner';

export class Player {
  private readonly _planner: MonteCarloPlanner;

  private readonly _environment: Environment;

  private readonly _actuators: Actuators;

  private readonly _logger: Logger;

  private readonly _pddlPlanner: PDDLPlanner;

  public constructor(
    position: Position,
    environment: Environment,
    actuators: Actuators
  ) {
    this._logger = createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.prettyPrint()
      ),
      transports: [new winston.transports.Console()],
    });

    this._planner = new MonteCarloPlanner(position, environment);
    this._planner.run();

    this._actuators = actuators;
    this._environment = environment;

    this._pddlPlanner = new PDDLPlanner(environment);
  }

  public async run() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const intention = this._planner.getBestIntention();
      if (intention === null) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(100);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await this.performIntention(intention);
      }
    }
  }

  private async performIntention(intention: Intention) {
    if (this._planner.position.equals(intention.position)) {
      if (intention instanceof PickUpIntention) {
        await this._actuators.pickup();
      } else if (intention instanceof PutDownIntention) {
        await this._actuators.putdown(intention.parcels);
      }

      this._planner.performedIntention(intention);
    } else {
      const direction = this._environment.nextDirection(
        this._planner.position,
        intention.position
      )!;

      const success = await this._actuators.move(direction);
      if (success) {
        this._planner.position = this._planner.position.moveTo(direction);
        await sleep(Config.getInstance().movementDuration);
      } else {
        this._logger.error('Failed to move agent to next position.');
        // const plan = await this._pddlPlanner.getPlan(
        //   this._planner.position,
        //   intention.position
        // );
        // for (const move of plan) {
        //   const action = await this._actuators.move(move);

        //   if (action) {
        //     this._planner.position = this._planner.position.moveTo(direction);
        //     await sleep(Config.getInstance().movementDuration);
        //   } else {
        //     this._logger.error('Failed to move agent to next position.');
        //     break;
        //   }
        // }
      }
    }
  }
}
