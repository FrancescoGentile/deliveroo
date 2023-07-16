import { writeFile } from 'fs/promises';

export class PDDLProblem {
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
        (:domain deliverooTemporal)
        (:objects ${this._objects.join(' ').trim()})
        (:init ${this._init.join(' ').trim()})
        (:goal (and ${this._goal.join(' ').trim()}))
        )`;
  }

  public addInitPredicate(predicate: string): void {
    this._init.push(predicate);
  }

  public addGoalPredicate(predicate: string): void {
    this._goal.push(predicate);
  }

  public async toFile(path: string): Promise<void> {
    return writeFile(path, this.toPDDLString());
  }
}
