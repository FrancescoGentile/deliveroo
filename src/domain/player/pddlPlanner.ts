import { exec } from 'child_process';
import { Environment } from 'src/domain/environment';
import { Position, PDDLProblem, Direction } from 'src/domain/structs';
import { parsePlan } from 'src/utils';

export class PDDLPlanner {
  private readonly _domain_path: string = 'pddl/domain.pddl';

  private readonly _problem_path: string = 'pddl/problem.pddl';

  private readonly _problem: PDDLProblem;

  private readonly _environment: Environment;

  public constructor(environment: Environment) {
    this._environment = environment;
    this._problem = environment.toPDDL();
  }

  public async getPlan(agentPosition: Position, agentDestination: Position): Promise<Direction[]> {
    const tmpProblem = structuredClone(this._problem);

    const agents = [];
    for (const agent of this._environment.getVisibleAgents()) {
      agents.push(`(agentAt t_${agent.currentPosition.row}_${agent.currentPosition.column})`);
    }
    tmpProblem.addInitPredicate(agents.join(' '));

    tmpProblem.addInitPredicate(`(at t_${agentPosition.row}_${agentPosition.column})`);

    tmpProblem.addGoalPredicate(`(at t_${agentDestination.row}_${agentDestination.column})`);

    await tmpProblem.toFile(this._problem_path);
    const plan = await this.runSolver();
    return new Promise((resolve, reject) => {
      try {
        resolve(parsePlan(plan));
      } catch (err) {
        reject(err);
      }
    });
  }

  private async runSolver(): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(`planutils run ff ${this._domain_path} ${this._problem_path}`, (err, stdout) => {
        if (err) {
          reject(err);
        }
        resolve(stdout);
      });
    });
  }
}
