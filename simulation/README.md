# Assurance Protocol Simulation Script

Anyone with a Quantstamp.com e-mail address can view the following [report](https://docs.google.com/document/d/120-6oXXEff-f4Prk2YFZdu0vVaV8IX56ts5QrwsZ830/edit?usp=sharing), which contains all details about the design of this script.

For example, you can read details about the definition of a state: A state is encoded as a binary number with the number of bits equal to the number of pools. Each bit indicates if the agent (staker) has placed a stake in the pool corresponding to the bit's index. For example state 11 (in decimal) is equal to 1011 in binary indicating that the agent has stakes in the 1st, 2nd and 4th pools. This also means that if we have 5 pools there are 2^5-1 possible states.

## Configuring the script

To configure this script look for the section entitled `START of config parameters for simulation stript`. There you will see a list of parameters that can be changed and some that should be kept fixed:

```
// Allowed range for numberOfPools is 1 to 5.
const numberOfPools = 5;
// Allowed range for numberOfAgents is 1 to 5. For more you need to add more elements to staker and stakerBudget
const numberOfAgents = 5;
// KEEP FIXED: The methods that an agent can decide to call, i.e. stakeFunds or withdrawStake.
const numberOfMethods = 2;
// KEEP FIXED: This value is multiplied with the minimum stake amount in a pool.
const numberOfMultipliers = 10;
// KEEP FIXED: An action is a number that encompases the following information: method, poolId and multiplier for stake amount.
const numberOfActions = 99;
// Allowed range is 0 to infinity. The number of steps that the simulation is executed before it stops.
const numberOfIterations = 200;
```

## Running the script locally

This simulation script has 2 output streams:
* stdout which is verbose debug text. Can be ignored.
* stderr which is in CSV format containing a header with one empty space as a separator.

To run the script and save the CSV in a separate file run the following command:

`$ truffle test simulation/StakingSimulation.js 2> simulation.csv`
