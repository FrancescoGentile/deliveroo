//
//
//

import { Actuators, Sensors } from './ports';
import { Environment } from './environment';
import { Player } from './player';

export async function initDomain(
  sensors: Sensors,
  actuators: Actuators
): Promise<Player> {
  const [state, env] = await Promise.all([
    sensors.getState(),
    Environment.new(sensors),
  ]);

  const player = new Player(state.position, env, actuators);

  return player;
}
