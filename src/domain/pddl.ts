//
//
//

import { exec } from "child_process";
import { writeFile } from "fs";
import { promisify } from "util";
import { BeliefSet } from "src/domain/beliefs";
import { Direction, Position } from "src/domain/structs";

export class PddlPlanner {
    private readonly _domain_path: string = "src/domain.pddl";

    private readonly _problem_path: string = "src/problem.pddl";

    private readonly _beliefs: BeliefSet;

    public constructor(environment: BeliefSet) {
        this._beliefs = environment;
    }

    public async getPlan(
        agentPosition: Position,
        agentDestination: Position,
    ): Promise<Direction[] | null> {
        const tmpProblem = this._toPDDL();

        const agents = [];
        for (const agent of this._beliefs.getAgents(true, false)) {
            agents.push(`(agentAt t_${agent.position.row}_${agent.position.column})`);
        }
        tmpProblem.addInitPredicate(agents.join(" "));

        tmpProblem.addInitPredicate(`(at t_${agentPosition.row}_${agentPosition.column})`);

        tmpProblem.addGoalPredicate(`(at t_${agentDestination.row}_${agentDestination.column})`);

        await tmpProblem.toFile(this._problem_path);
        const plan = await this._runSolver();
        return this._parsePlan(plan);
    }

    private async _runSolver(): Promise<string> {
        const command = `planutils run ff ${this._domain_path} ${this._problem_path}`;
        const execAsync = promisify(exec);
        const result = await execAsync(command);
        if (result.stderr) {
            throw new Error(result.stderr);
        }
        return result.stdout;
    }

    private _toPDDL(): PDDLProblem {
        const envTiles = [...this._beliefs.map.tiles];
        const tiles = envTiles.map((tile) => `t_${tile.position.row}_${tile.position.column}`);
        tiles.push("- tile");

        const neigbours = [];
        for (const tile of envTiles) {
            for (const neighbour of this._beliefs.map.adjacent(tile.position)) {
                const nextDirection = tile.position.directionTo(neighbour);
                neigbours.push(
                    `(${nextDirection} t_${tile.position.row}_${tile.position.column} t_${neighbour.row}_${neighbour.column})`,
                );
            }
        }

        return new PDDLProblem(tiles, neigbours, [""]);
    }

    private _parsePlan(plan: string): Direction[] | null {
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
        if (directions.length === 0) {
            return null;
        }
        return directions;
    }
}

class PDDLProblem {
    private _objects: string[];

    private _init: string[];

    private _goal: string[];

    public constructor(objects: string[], init: string[], goal: string[]) {
        this._objects = objects;
        this._init = init;
        this._goal = goal;
    }

    public toPDDLString(): string {
        return `(define (problem problem1)
        (:domain deliveroo)
        (:objects ${this._objects.join(" ").trim()})
        (:init ${this._init.join(" ").trim()})
        (:goal (and ${this._goal.join(" ").trim()}))
        )`;
    }

    public addInitPredicate(predicate: string): void {
        this._init.push(predicate);
    }

    public addGoalPredicate(predicate: string): void {
        this._goal.push(predicate);
    }

    public async toFile(path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            writeFile(path, this.toPDDLString(), (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
    }
}

///////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////

function searchStringInArray(str: string, strArray: string[]) {
    for (let j = 0; j < strArray.length; j += 1) {
        if (strArray[j].match(str)) return j;
    }
    return -1;
}
