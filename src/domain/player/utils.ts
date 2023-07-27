//
//
//

import { Config, Intention, IntentionType, Parcel, Position } from 'src/domain/structs';

import { Environment } from 'src/domain/environment';
import { Instant } from 'src/utils';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface State {
  availablePositions: Position[];

  readonly pickedParcels: Parcel[];

  readonly arrivalTime: Instant;

  readonly environment: Environment;
}

function greedyValue(
  intention: Intention,
  pickedParcels: Parcel[],
  startPosition: Position,
  startTime: Instant,
  environment: Environment
): number {
  switch (intention.type) {
    case IntentionType.PICKUP: {
      const pickupPosition = intention.position;
      const deliveryPosition = environment.getClosestDeliveryPosition(pickupPosition);
      const distance =
        environment.distance(startPosition, pickupPosition) +
        environment.distance(pickupPosition, deliveryPosition);

      const { movementDuration } = Config.getInstance();
      const timeToArrive = movementDuration.multiply(distance);
      const arrivalTime = startTime.add(timeToArrive);

      let value = 0;
      for (const parcel of environment.getParcelsByPosition(pickupPosition)) {
        value += parcel.value.getValueByInstant(arrivalTime);
      }

      for (const parcel of pickedParcels) {
        value += parcel.value.getValueByInstant(arrivalTime);
      }

      return value;
    }
    case IntentionType.PUTDOWN: {
      const distance = environment.distance(startPosition, intention.position);
      const { movementDuration } = Config.getInstance();
      const timeToArrive = movementDuration.multiply(distance);
      const arrivalTime = startTime.add(timeToArrive);

      let value = 0;
      for (const parcel of pickedParcels) {
        value += parcel.value.getValueByInstant(arrivalTime);
      }

      return value;
    }
    default: {
      throw new Error(`Intention type ${intention.type} not supported`);
    }
  }
}

export function greedySortIntentions(
  intentions: Intention[],
  pickedParcels: Parcel[],
  startPosition: Position,
  startTime: Instant,
  environment: Environment
): Intention[] {
  const intentionsWithValues: [Intention, number][] = intentions.map((i) => [
    i,
    greedyValue(i, pickedParcels, startPosition, startTime, environment),
  ]);
  intentionsWithValues.sort((a, b) => b[1] - a[1]);
  return intentionsWithValues.map((i) => i[0]);
}
