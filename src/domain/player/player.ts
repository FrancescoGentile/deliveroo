//
//
//

import winston, { createLogger, Logger } from 'winston';

import { HashMap, HashSet, sleep } from 'src/utils';
import { Environment } from 'src/domain/environment';
import { Actuators } from 'src/domain/ports';
import { Config, Direction, Intention, IntentionType, Position } from 'src/domain/structs';
import { MonteCarloPlanner } from './planner';
// import { PDDLPlanner } from './pddlPlanner';

export class Player {
  private readonly _planner: MonteCarloPlanner;

  private readonly _environment: Environment;

  private readonly _actuators: Actuators;

  private _actualPaths: HashMap<Intention, Direction[] | null> = new HashMap();

  private _blockedBottlenecks: [HashSet<Position>, Intention][] = [];

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
    this._environment.onOccupiedPositionsChange(() => this.onOccupiedPositionsChange());

    // this._pddlPlanner = new PDDLPlanner(environment);
  }

  public async run() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const intention = this._planner.getBestIntention(this._actualPaths);
      if (intention === null) {
        const { movementDuration } = Config.getInstance();
        await sleep(movementDuration);
        continue;
      }

      // console.log(intention);

      if (this._planner.position.equals(intention.position)) {
        this._actualPaths.delete(intention);
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
        let directions: Direction[];
        if (this._actualPaths.has(intention)) {
          directions = [this._actualPaths.get(intention)!.shift()!];
        } else {
          directions = this._environment.getNextDirections(
            this._planner.position,
            intention.position
          )!;
        }

        let success = false;
        for (const direction of directions) {
          success = await this._actuators.move(direction);
          if (success) {
            this._planner.position = this._planner.position.moveTo(direction);
            break;
          }
        }

        if (!success) {
          const path = this._environment.recomputePath(this._planner.position, intention.position);
          this._actualPaths.set(intention, path);

          const bottleneck = this._environment.computeBottleneck(
            this._planner.position,
            intention.position
          );

          this._blockedBottlenecks.push([bottleneck, intention]);
        }
      }
    }
  }

  private onOccupiedPositionsChange() {
    const oldActualPaths = this._actualPaths;
    const oldBlockedBottlenecks = this._blockedBottlenecks;

    const newActualPaths: HashMap<Intention, Direction[] | null> = new HashMap();
    const newBlockedBottlenecks: [HashSet<Position>, Intention][] = [];

    const alreadyAdded: boolean[] = new Array(oldBlockedBottlenecks.length).fill(false);

    for (const agent of this._environment.getVisibleAgents()) {
      for (const [idx, [bottleneck, intention]] of oldBlockedBottlenecks.entries()) {
        if (bottleneck.has(agent.currentPosition)) {
          if (oldActualPaths.has(intention)) {
            newActualPaths.set(intention, oldActualPaths.get(intention)!);

            if (!alreadyAdded[idx]) {
              newBlockedBottlenecks.push([bottleneck, intention]);
              alreadyAdded[idx] = true;
            }
          }
        }
      }
    }

    this._actualPaths = newActualPaths;
    this._blockedBottlenecks = newBlockedBottlenecks;
  }
}
