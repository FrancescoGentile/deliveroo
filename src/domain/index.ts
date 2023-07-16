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
  const [pos, env] = await Promise.all([
    sensors.getPosition(),
    Environment.new(sensors),
  ]);

  const player = new Player(pos, env, actuators);

  return player;
}
