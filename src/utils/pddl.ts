//
//
//

import { Direction } from "src/domain/structs";

export function searchStringInArray(str: string, strArray: string[]) {
    for (let j = 0; j < strArray.length; j += 1) {
        if (strArray[j].match(str)) return j;
    }
    return -1;
}

export function parsePlan(plan: string): Direction[] {
    const planArray = plan.toLowerCase().split("\n");
    const startIndex = searchStringInArray("step", planArray);
    const endIndex = searchStringInArray("time spent", planArray) - 2;
    if (startIndex === -1 || endIndex === -1) {
        return [];
    }

    const directions = planArray.slice(startIndex, endIndex).map((line) => {
        const lineTrim = line.trim();
        const line_array = lineTrim.split(" ").splice(-3);
        if (line_array[0] === "up") {
            return Direction.UP;
        }
        if (line_array[0] === "down") {
            return Direction.DOWN;
        }
        if (line_array[0] === "left") {
            return Direction.LEFT;
        }
        if (line_array[0] === "right") {
            return Direction.RIGHT;
        }
        throw new Error("Invalid direction");
    });
    return directions;
}
