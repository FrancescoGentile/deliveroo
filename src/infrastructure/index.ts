//
//
//

import { Actuators, Sensors, Messenger } from 'src/logic/ports';
import { Client } from './client';

export async function initInfrastructure(): Promise<[Sensors, Actuators, Messenger]> {
  if (!process.env.HOST || !process.env.TOKEN) {
    throw new Error('HOST and TOKEN must be set in the environment.');
  }

  const client = new Client(process.env.HOST, process.env.TOKEN);

  return [client, client, client];
}
