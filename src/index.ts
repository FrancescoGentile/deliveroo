//
//
//

import * as dotenv from 'dotenv';

import { initInfrastructure } from './infrastructure';
import { initDomain } from './domain';

async function main() {
  dotenv.config();

  if (!process.env.HOST || !process.env.TOKEN) {
    throw new Error('HOST and TOKEN must be set.');
  }

  const [sensors, actuators] = await initInfrastructure(process.env.HOST, process.env.TOKEN);
  const player = await initDomain(sensors, actuators);
  await player.run();
}

main()
  // eslint-disable-next-line no-console
  .then(() => console.log('Terminated.'))
  // eslint-disable-next-line no-console
  .catch((err: Error) => console.error(err));
