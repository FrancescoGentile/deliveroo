//
//
//

import winston, { createLogger, Logger } from 'winston';

import { Environment } from 'src/domain/environment';
import { Actuators } from 'src/domain/ports';
import { Direction, Intention, IntentionType, Position } from 'src/domain/structs';
import { MonteCarloPlanner } from './planner';
// import { PDDLPlanner } from './pddlPlanner';

export class Player {
  private readonly _planner: MonteCarloPlanner;

  private readonly _environment: Environment;

  private readonly _actuators: Actuators;

  private readonly _logger: Logger;

  // private readonly _pddlPlanner: PDDLPlanner;

  public constructor(position: Position, environment: Environment, actuators: Actuators) {
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

    // this._pddlPlanner = new PDDLPlanner(environment);
  }

  public async run() {
    let actual_path: [Intention, Direction[]] | null = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let actual_distance: [Intention, number] | null = null;
      if (actual_path !== null) {
        if (actual_path[1].length === 0) {
          actual_distance = [actual_path[0], Infinity];
        } else {
          actual_distance = [actual_path[0], actual_path[1].length];
        }
      }

      const intention = this._planner.getBestIntention(actual_distance);

      if (this._planner.position.equals(intention.position)) {
        switch (intention.type) {
          case IntentionType.PICKUP:
            await this._actuators.pickup();
            break;
          case IntentionType.PUTDOWN:
            await this._actuators.putdown(null);
            break;
          default:
            break;
        }

        this._planner.performedIntention(intention);
      } else {
        let direction: Direction;
        if (actual_path === null || !actual_path[0].equals(intention)) {
          direction = this._environment.nextDirection(this._planner.position, intention.position)!;
          actual_path = null;
        } else {
          direction = actual_path[1].shift()!;
        }

        const success = await this._actuators.move(direction);
        if (success) {
          this._planner.position = this._planner.position.moveTo(direction);
        } else {
          const path = this._environment.recomputePath(this._planner.position, intention.position);

          if (path === null) {
            actual_path = [intention, []];
          } else {
            actual_path = [intention, path];
          }
        }
      }
    }
  }
}
