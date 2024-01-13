//
//
//

import { Actuators, Messenger, Sensors } from "src/logic/ports";
import { Client } from "./client";

export async function initInfrastructure(): Promise<
    [Sensors, Actuators, Messenger]
> {
    const cliToken = process.argv
        .find((arg) => arg.startsWith("--token"))
        ?.split("=")[1];

    if (!process.env.HOST || !process.env.TOKEN) {
        throw new Error("HOST and TOKEN must be set in the environment.");
    }

    const token = cliToken ?? process.env.TOKEN;

    const client = new Client(process.env.HOST, token);

    return [client, client, client];
}
