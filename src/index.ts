//
//
//

import * as dotenv from 'dotenv';

import { initInfrastructure } from './infrastructure';
import { startPlayer } from './logic';

async function main() {
  dotenv.config();

  const [sensors, actuators, messenger] = await initInfrastructure();
  const player = await startPlayer(sensors, actuators, messenger);
  await player.start();
}

main()
  // eslint-disable-next-line no-console
  .then(() => console.log('Terminated.'))
  // eslint-disable-next-line no-console
  .catch((err: Error) => console.error(err));
