//
//
//

import { Server } from 'src/domain/ports';
import { SocketIOServer } from './server';

export async function initInfrastructure(
  host: string,
  token: string
): Promise<Server> {
  const broker = await SocketIOServer.new(host, token);

  return broker;
}
