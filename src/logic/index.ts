//
//
//

import { GraphMap } from "./map";
import { Player } from "./player";
import { Actuators, Messenger, Sensors } from "./ports";
import { GameConfig } from "./structs";

export async function startPlayer(
    sensors: Sensors,
    actuators: Actuators,
    messenger: Messenger,
): Promise<Player> {
    const [config, tiles, id, position] = await Promise.all([
        sensors.getConfig(),
        sensors.getCrossableTiles(),
        sensors.getID(),
        sensors.getPosition(),
    ]);
    GameConfig.configure(config);

    const map = await GraphMap.new(tiles);
    const player = new Player(id, position, map, sensors, actuators, messenger);

    return player;
}
