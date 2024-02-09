<div align="center">

# DELIVEROO

<h4>Project for the "Autonomous Software Agents" course 2023</h4>

</div>

## How to run the project

To install the project, first clone the repository and then run the following commands:

```bash
# Clone the repository
git clone https://github.com/FrancescoGentile/deliveroo.git

# Move to the project directory
cd deliveroo

# Install the dependencies
pnpm install
# or (if you prefer npm)
npm install
```

Then, to run the project, you can use the following commands:

```bash
# First transpile the TypeScript files to JavaScript
pnpm build
# or (if you prefer npm)
npm run build

# Then run the project
pnpm start
# or (if you prefer npm)
npm start
```

Or, if you prefer, you can use the following command to transpile the TypeScript files and run the project in one step:

```bash
pnpm start:dev
# or (if you prefer npm)
npm run start:dev
```

### Configuration

To run the project, you need to set some parameters that are used to configure the agents and the environment. You can provide such parameters as environment variables (also using a `.env` file) or as command line arguments (the latter will override the former).

The list of the parameters that you can set is the following (the environment variable name is in parentheses):

- `host` (`HOST`): the host (in the form `http://<host>:<port>`) of the server running the environment
- `token` (`TOKEN`): the token used to identify the agent
- `secret-key` (`SECRET_KEY`): the secret key used to cypher and decypher the `hello` messages exchanged between the agents
- `secret-seed` (`SECRET_SEED`): the secret seed used to seed the random number generator used to generate the inizialization vector of the cypher
- `hello-interval` (`HELLO_INTERVAL`): the interval (in milliseconds) at which the agent sends the `hello` message to the other agents (default: 2000)
- `max-last-heard` (`MAX_LAST_HEARD`): the maximum time (in milliseconds) that can pass without hearing from a team mate before considering it as dead (default: 6000)
- `start-iterations` (`START_ITERATIONS`): the number of Monte Carlo iterations to perform before starting the agent (default: 10)
- `num-promising-positions` (`NUM_PROMISING_POSITIONS`): the number of promising positions to consider when choosing the next move intention (default: 5)
- `gaussian-std` (`GAUSSIAN_STD`): the standard deviation of the Gaussian distribution used to generate the expected value of a tile (default: 1.0)
- `discount-factor` (`DISCOUNT_FACTOR`): the discount factor used to discount the values of the parcels picked by other team mates (default: 0.1)
- `use-pddl` (`USE_PDDL`): whether or not to use PDDL to recompute failed paths (default: False)

Parameters `host`, `token`, `secret-key`, and `secret-seed` are mandatory. The other parameters will be set to the default values if not provided.

## Running the PDDL planner

In order to run the PDDL planner you need to have the `planutils` package installed. You can install it by running the following command:

```bash
pip install planutils
```

Then, before running the project the planutils environment need to be activated by running the following command:

```bash
planutils_activate
```
