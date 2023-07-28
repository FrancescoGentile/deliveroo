//
//
//

import winston, { createLogger, Logger } from 'winston';

import { HashMap } from 'src/utils';
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
    const actualPaths: HashMap<Intention, Direction[] | null> = new HashMap();
    let blockedPositions: HashMap<Position, Intention[]> = new HashMap();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const tmp = new HashMap<Position, Intention[]>();
      for (const agent of this._environment.getVisibleAgents()) {
        const blockedIntentions = blockedPositions.get(agent.currentPosition);
        if (blockedIntentions !== undefined) {
          tmp.set(agent.currentPosition, blockedIntentions);
        }
      }
      blockedPositions = tmp;

      const intention = this._planner.getBestIntention(actualPaths);
      // console.log(intention);

      if (this._planner.position.equals(intention.position)) {
        // console.log('performing intention');
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
        if (actualPaths.has(intention)) {
          direction = actualPaths.get(intention)!.shift()!;
        } else {
          direction = this._environment.nextDirection(this._planner.position, intention.position)!;
        }

        const success = await this._actuators.move(direction);
        if (success) {
          this._planner.position = this._planner.position.moveTo(direction);
        } else {
          const path = this._environment.recomputePath(this._planner.position, intention.position);
          actualPaths.set(intention, path);

          const blockedPosition = blockedPositions.get(intention.position) ?? [];
          blockedPosition.push(intention);
          blockedPositions.set(intention.position, blockedPosition);
        }
      }
    }
  }
}
