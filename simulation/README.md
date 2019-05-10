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
### Format of input
The format of the input file is a simple text file that contains a title string on the first line and on each of the subsequent lines contains the following parameters (in this order):

1. Number of simulation steps
1. Number of agents
1. Number of pools (between 1 and 5)
1. Initial price of QSP
1. Price of QSP changes at iteration
1. New price of QSP
1. For each agent the following 4 values
    
    a. Budget 
    
    b. added to expert list in iteration number
    
    c. removed from expert list in iteration number
    
    d. reward function index
1. For each pool the following 13 values

    a. owner

    b. maxPayoutQspWei

    c. minStakeQspWei

    d. maxTotalStake

    e. depositQspWei

    f. bonusExpertFactor

    g. bonusFirstExpertFactor

    h. payPeriodInBlocks

    i. minStakeTimeInBlocks

    j. timeoutInBlocks

    k. risk factor

    l. bribe value

    m. violated at iteration number

The name of the input file is specified using a full path string assigned to the `inputFile` variable.

### Format of output
Two streams are output by the execution of the simulation script: 

* The stdout output is a set of unstructured debug messages, which indicate the values of pool parameters and stakers during each step. 
* The stderr output is a CSV file (with space as a separator) containing the following columns:

1. Tick - the iteration step
1. Block - the block number at the beginning of the iteration
1. For each agent the following columns:

    a. StakeCount<Agent index> 

    b. TotalStakeQspWei<Agent index>

    c. TotalStakers<Agent index>

    d. DepositQspWei<Agent index>

    e. PoolState<Agent index>

    f. PoolSizeQspWei<Agent index>

    g. MinStakeStartBlock<Agent index>
1. For each agent the following columns:

    a. ActionOfAgent<Agent index>
    
    b. For each pool:

        i. WithdrawInterestAgent<Agent index>
        ii. PoolId<Pool ID> 
1. For each agent the following columns:

    a. Method<Agent index>
    
    b. Amount<Agent index>

    c. PoolId<Agent index>

    d. Error<Agent index>

1. For each agent the following columns:

    a. RewardAgent<Agent index>

    b.BalanceAgent<Agent index>  

## Running the script locally

This simulation script has 2 output streams:
* stdout which is verbose debug text. Can be ignored.
* stderr which is in CSV format containing a header with one empty space as a separator.

To run the script and save the CSV in a separate file run the following command:

`$ truffle test simulation/StakingSimulation.js 2> simulation-run.csv 1> simulation.log`
