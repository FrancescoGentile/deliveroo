//
//
//

import winston, { createLogger, Logger } from 'winston';
import {
  Config,
  Intention,
  MoveIntention,
  PickUpIntention,
  PutDownIntention,
} from 'src/domain/models';
import { Agent, Environment, Server } from 'src/domain/ports';
import { sleep } from 'src/utils';
import { MonteCarloPlanner } from './planner';

export class MonteCarloAgent implements Agent {
  private constructor(
    private readonly _planner: MonteCarloPlanner,
    private readonly _environment: Environment,
    private readonly _server: Server,
    private readonly _logger: Logger
  ) {}

  public static async new(
    environment: Environment,
    server: Server
  ): Promise<MonteCarloAgent> {
    const logger = createLogger({
      level: 'debug',
      format: winston.format.json(),
      transports: [new winston.transports.Console()],
    });

    const planner = await MonteCarloPlanner.new(
      server.initialPosition,
      environment
    );
    planner.run();

    return new MonteCarloAgent(planner, environment, server, logger);
  }

  public async run() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const intention = this._planner.getBestIntention();
      // eslint-disable-next-line no-await-in-loop
      await this.performIntention(intention);
    }
  }

  private async performIntention(intention: Intention) {
    if (this._planner.location.equals(intention.position)) {
      if (intention instanceof PickUpIntention) {
        const pickedParcels = await this._server.pickUp();
        const existingParcels = this._environment.getParcels();

        for (const parcel of intention.parcels) {
          // Notice: if the parcel no longer exists, this means that it has expired.
          // However, the agent has already taken into consideration that
          // some parcels may expire during the planning phase, thus it is not a logical error.
          if (
            !pickedParcels.has(parcel._id) &&
            existingParcels.has(parcel._id)
          ) {
            this._logger.error(
              `Parcel ${parcel.toString()} was not picked up by the agent.`
            );
          }
        }
      } else if (intention instanceof PutDownIntention) {
        const putDownParcels = await this._server.putDown(intention.parcels);
        const existingParcels = this._environment.getParcels();

        if (intention.parcels !== null) {
          for (const parcel of intention.parcels) {
            // Notice: check IntentionType.PICKUP for explanation.
            if (
              !putDownParcels.has(parcel._id) &&
              existingParcels.has(parcel._id)
            ) {
              this._logger.error(
                `Parcel ${parcel.toString()} was not put down by the agent.`
              );
            }
          }
        }
      } else if (intention instanceof MoveIntention) {
        // Notice: the agent is already at the destination.
        // We need to wait for the planner to plan the next intention.
      } else {
        throw new Error('Unknown intention type.');
      }

      this._planner.performedIntention(intention);
    } else {
      const direction = this._environment.nextDirection(
        this._planner.location,
        intention.position
      )!;

      const success = await this._server.move(direction);
      if (success) {
        this._planner.location = this._planner.location.moveTo(direction);
        await sleep(Config.getInstance().movementDuration);
      } else {
        this._logger.error('Failed to move agent to next position.');
      }
    }
  }
}
