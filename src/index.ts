//
//
//

import commandLineArgs from "command-line-args";
import * as dotenv from "dotenv";

import { GridMap } from "./domain/map";
import { Player } from "./domain/player";
import { Config, PlayerConfig } from "./domain/structs";
import { SocketIOClient } from "./infrastructure";
import { Duration } from "./utils";

function getConfig(): [PlayerConfig, string, string] {
    dotenv.config();

    const options = [
        { name: "host", type: String },
        { name: "token", type: String },
        { name: "secret-key", type: String },
        { name: "secret-seed", type: String },
        { name: "hello-interval", type: Number },
        { name: "max-last-heard", type: Number },
        { name: "start-iterations", type: Number },
        { name: "num-promising-positions", type: Number },
        { name: "gaussian-std", type: Number },
    ];

    const defaultValues = new Map<string, number>();
    defaultValues.set("hello-interval", 2000);
    defaultValues.set("max-last-heard", 6000);
    defaultValues.set("start-iterations", 10);
    defaultValues.set("num-promising-positions", 5);
    defaultValues.set("gaussian-std", 1.0);

    // first check if the corresponding environment variables are set
    const config = new Map<string, string | number>();
    for (const option of options) {
        const varName = option.name.toUpperCase().replace(/-/g, "_");
        if (process.env[varName]) {
            config.set(option.name, option.type(process.env[varName]));
        }
    }

    // then parse the command line arguments
    const cliArgs = commandLineArgs(options);
    for (const arg in cliArgs) {
        config.set(arg, cliArgs[arg]);
    }

    // check that all options are set
    for (const option of options) {
        if (!config.get(option.name)) {
            if (defaultValues.has(option.name)) {
                config.set(option.name, defaultValues.get(option.name)!);
            } else {
                throw new Error(`Missing option ${option.name}`);
            }
        }
    }

    const playerConfig: PlayerConfig = {
        secretKey: config.get("secret-key") as string,
        secretSeed: config.get("secret-seed") as string,
        helloInterval: Duration.fromMilliseconds(config.get("hello-interval") as number),
        maxLastHeard: Duration.fromMilliseconds(config.get("max-last-heard") as number),
        startIterations: config.get("start-iterations") as number,
        numPromisingPositions: config.get("num-promising-positions") as number,
        gaussianStd: config.get("gaussian-std") as number,
    };

    return [playerConfig, config.get("host") as string, config.get("token") as string];
}

async function main() {
    const [playerConfig, host, token] = getConfig();
    const client = new SocketIOClient(host, token);

    const [environmentConfig, position, id, crossableTiles] = await Promise.all([
        client.getEnvironmentConfig(),
        client.getPosition(),
        client.getID(),
        client.getCrossableTiles(),
    ]);
    Config.init(environmentConfig, playerConfig);

    const map = await GridMap.new(crossableTiles);
    const player = new Player(map, id, position, client, client, client);
    await player.start();
}

main()
    // eslint-disable-next-line no-console
    .then(() => console.log("Terminated."))
    // eslint-disable-next-line no-console
    .catch((err) => console.error(err));
