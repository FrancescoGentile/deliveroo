//
//
//

import { Actuators, Sensors } from 'src/domain/ports';
import { Client } from './client';

export async function initInfrastructure(
  host: string,
  token: string
): Promise<[Sensors, Actuators]> {
  const client = new Client(host, token);

  return [client, client];
}
