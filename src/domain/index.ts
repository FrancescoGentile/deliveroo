//
//
//

import { Config } from './models';
import { Agent, Server } from './ports';
import { MonteCarloAgent, SeidelEnvironment } from './logic';

export async function initAgent(server: Server): Promise<Agent> {
  Config.configure(server.config);
  const env = SeidelEnvironment.new(server);
  const agent = MonteCarloAgent.new(env, server);

  return agent;
}
