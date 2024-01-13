//
//
//

import { Environment } from "./environment";
import { Player } from "./player";
import { Actuators, Sensors } from "./ports";

export async function initDomain(
    sensors: Sensors,
    actuators: Actuators,
): Promise<Player> {
    const [position, env] = await Promise.all([
        sensors.getPosition(),
        Environment.new(sensors),
    ]);

    const player = new Player(position, env, actuators);

    return player;
}
