//
//
//

import * as dotenv from 'dotenv';

import { initInfrastructure } from './infrastructure';
import { initAgent } from './domain';

async function main() {
  dotenv.config();

  if (!process.env.HOST || !process.env.TOKEN) {
    throw new Error('HOST and TOKEN must be set.');
  }

  const server = await initInfrastructure(process.env.HOST, process.env.TOKEN);
  const agent = await initAgent(server);
  await agent.run();
}

main()
  // eslint-disable-next-line no-console
  .then(() => console.log('Terminated.'))
  // eslint-disable-next-line no-console
  .catch((err: Error) => console.error(err));
