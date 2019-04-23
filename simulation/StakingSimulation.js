/**
 * This simulation script has 2 output streams:
 * - stdout which is verbose debug text. Can be ignored.
 * - stderr which is in CSV format containing a header with one empty space as a separator.
 * To run the script and save the CSV in a separate file run the following command:
 * $ truffle test simulation/StakingSimulation.js 2> simulation.csv
 */
const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const TrivialBackdoorPolicy = artifacts.require('policies/TrivialBackdoorPolicy');
const CandidateContract = artifacts.require('CandidateContract');
const CandidateToken = artifacts.require('CandidateToken');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const RegistryWrapper = artifacts.require('TokenCuratedRegistry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const TCRUtil = require('../test/tcrutils.js');
const Util = require("../test/util.js");
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));
const RL = require('reinforce-js');

const PoolState = Object.freeze({
  None : 0,
  Initialized : 1,
  NotViolatedUnderfunded : 2,
  ViolatedUnderfunded : 3,
  NotViolatedFunded : 4,
  ViolatedFunded : 5,
  Cancelled: 6,
  PolicyExpired: 7
});

// list where we will insert pools once they are created
let pools = [];
let qspb;
let quantstampStakingData;
let quantstampToken;
let csv_head;
let csv_row;
let params;

/**************************************************
 * START of config parameters for simulation stript
***************************************************/
// File containing the simulation configuration parameters
const inputFile = "file:///home/sebi/bc/tmp3/qsp-staking-protocol/simulation/run9.txt"
// Allowed range for numberOfPools is 1 to 5.
var numberOfPools = 5;
// Allowed range for numberOfAgents is 1 to 5. For more you need to add more elements to staker and stakerBudget
var numberOfAgents = 5;
// KEEP FIXED: The methods that an agent can decide to call, i.e. stakeFunds or withdrawStake.
var numberOfMethods = 2;
// KEEP FIXED: This value is multiplied with the stakeMultiplier amount in a pool.
var numberOfMultipliers = 10;
// Allowed range 1 to infinity. Represents the amount of QSP that will be staked in a pool after it is multiplied by the multiplier.
var stakeMultiplier = new BigNumber(Util.toQsp(100));
// KEEP FIXED: An action is a number that encompases the following information: method, poolId and multiplier for stake amount.
var numberOfActions = 9;
// Allowed range is 0 to infinity. The number of steps that the simulation is executed before it stops.
var numberOfIterations = 200;
// Allowed range is 1 to 1.000.000. The rate at which QSP is seen with respect to a ficticious currency. It can go up/down
var qspPriceRate = 1000;
// Allowed range for list keys is 1 to numberOfIterations and for list values it is 1 to 1000.000.
var qspPriceChange = [];
// Allowed range for list keys is 1 to numberOfIterations and for list values it is 1 to numberOfAgents. Add minus in front to remove from list.
var expertListChange = [];

// Modify the following parameters only if you know what you are doing.
const opt = new RL.TDOpt();
opt.setUpdate('sarsa'); // 'qlearn' or 'sarsa' 
opt.setGamma(0.9);
opt.setEpsilon(1.0);
opt.setAlpha(0.7);
opt.setLambda(0);
opt.setReplacingTraces(true);
opt.setNumberOfPlanningSteps(50);
opt.setSmoothPolicyUpdate(true);
opt.setBeta(0.1);
/************************************************
 * END of config parameters for simulation stript
*************************************************/

var eyes = []; // This list of structs that will contain the pool characteristics for all pools in the simulation.
var csv_head_written = false;

function dec2bin(dec){
  return (dec >>> 0).toString(2);
}

function onlyUnique(value, index, self) { 
  return self.indexOf(value) === index;
}

function readTextFile(file)
{
  var retVal = ["empty"];
  var rawFile = new XMLHttpRequest();
  rawFile.open("GET", file, false);
  console.log("File was opened");
  rawFile.onreadystatechange = function () {
    if(rawFile.readyState === 4) {
      if(rawFile.status === 200 || rawFile.status == 0) {
        var allText = rawFile.responseText;
        console.log("File was read");
        retVal = allText.split("\n");
      } else {
        console.log("Wrong status");
      }
    } else {
      console.log("Not in ready state");
    }
  }
  rawFile.send(null);
  return retVal;
}

var World = function() {
  this.agents = [];
  this.clock = 0;
};

World.prototype = {
  tick: async function() {
    // tick the environment
    this.clock++;
    // one row in the output CSV file
    csv_row = this.clock + " " + (await web3.eth.getBlock("latest")).number;
    csv_head = "Tick Block";
    console.log("=============== At clock tick: " + this.clock + " ==============");
    // fix input to all agents based on environment
    for (var i = 0; i < numberOfPools; i++) {
      eyes[i].stakeCount = (await quantstampStakingData.getPoolStakeCount(i)).toNumber();
      console.log("Pool #" + i + ": has a stake count of " + eyes[i].stakeCount);
      csv_row += " " + eyes[i].stakeCount;
      csv_head += " StakeCount" + i;
      eyes[i].totalStakeQspWei = (await quantstampStakingData.getPoolTotalStakeQspWei(i)).toNumber();
      console.log("\t\t total stake " + eyes[i].totalStakeQspWei);
      csv_row += " " + eyes[i].totalStakeQspWei;
      csv_head += " TotalStakeQspWei" + i;
      eyes[i].totalStakers = (await quantstampStakingData.getPoolStakersList(i)).length;
      console.log("\t\t total stake " + eyes[i].totalStakers);
      csv_row += " " + eyes[i].totalStakers;
      csv_head += " totalStakers" + i;
      eyes[i].depositQspWei = (await quantstampStakingData.getPoolDepositQspWei(i)).toNumber();
      console.log("\t\t deposit of " + eyes[i].depositQspWei);
      csv_row += " " + eyes[i].depositQspWei;
      csv_head += " DepositQspWei" + i;
      eyes[i].state = (await quantstampStakingData.getPoolState(i)).toNumber();
      console.log("\t\t in state " + eyes[i].state);
      csv_row += " " + eyes[i].state;
      csv_head += " PoolState" + i;
      eyes[i].poolSizeQspWei = (await quantstampStakingData.getPoolSizeQspWei(i)).toNumber();
      console.log("\t\t size of " + eyes[i].poolSizeQspWei);
      csv_row += " " + eyes[i].poolSizeQspWei;
      csv_head += " PoolSizeQspWei" + i;
      eyes[i].minStakeStartBlock = (await quantstampStakingData.getPoolMinStakeStartBlock(i)).toNumber();
      console.log("\t\t minStakeStartBlock of " + eyes[i].minStakeStartBlock);
      csv_row += " " + eyes[i].minStakeStartBlock;
      csv_head += " MinStakeStartBlock" + i;
    }
    
    // let the agents behave in the world based on their input
    for (i = 0; i < this.agents.length; i++) {
      await this.agents[i].forward();
    }

    // apply outputs of agents on evironment
    for (i = 0; i < this.agents.length; i++) {
      var a = this.agents[i];
      if (a.action == undefined) {
        continue;
      }
      var tmp = a.action % numberOfMultipliers;
      var pool = Math.floor(tmp/numberOfMethods);
      eyes[pool].lastAmountStaked = (Math.floor(a.action / numberOfMultipliers)+1)*stakeMultiplier;
      var amount = eyes[pool].lastAmountStaked;
      csv_head += " Method" + i + " Amount" + i + " PoolId" + i + " Error" + i;
      // execute agent's desired action
      if (tmp % numberOfMethods === 0) { // stakeFunds
        csv_row += " stakeFunds " + amount + " " + pool;
        try {
          await qspb.stakeFunds(pool, amount, {from : a.address});
          a.state |= (1 << pool);
          console.log(dec2bin(a.state) + " Agent " + a.id + " stakes " + amount/(10**18) + " in pool " + pool);
          csv_row += " 0";
        } catch (err) {
          console.log("Agent " + a.id + " could not stake " + amount/(10**18) + " in pool " + pool);
          console.log(err.message + " " + err.stack);
          csv_row += " 1";
        }
      } else if (tmp % numberOfMethods === 1) { // withdrawStake
        csv_row += " withdrawStake 0 " + pool;
        try {
          await qspb.withdrawStake(pool, {from : a.address});
          a.state &= (a.numberOfStates ^ (1 << pool));
          console.log(dec2bin(a.state) + " Agent " + a.id + " withdraws funds from pool " + pool);
          csv_row += " 0";
        } catch (err) {
          console.log("Agent " + a.id + " could not withdraw funds from pool " + pool);
          console.log(err.message + " " + err.stack);
          csv_row += " 1";
        }
      }
    }
    
    // agents are given the opportunity to learn based on feedback of their action on environment
    for (i = 0; i < this.agents.length; i++) {
      await this.agents[i].backward();
    }

    if (!csv_head_written) {
      console.error(csv_head);
      csv_head_written = true;
    }
    console.error(csv_row);
  }
};

// Eye sensor senses pools based on index
var Eye = function(quantstampStakingData, poolIndex) {
  return (async () => {
    this.maxPayoutQspWei = (await quantstampStakingData.getPoolMaxPayoutQspWei(poolIndex)).toNumber();
    this.minStakeQspWei = (await quantstampStakingData.getPoolMinStakeQspWei(poolIndex)).toNumber();
    this.bonusExpertFactor = (await quantstampStakingData.getPoolBonusExpertFactor(poolIndex)).toNumber();
    this.bonusFirstExpertFactor = (await quantstampStakingData.getPoolBonusFirstExpertFactor(poolIndex)).toNumber();
    this.payPeriodInBlocks = (await quantstampStakingData.getPoolPayPeriodInBlocks(poolIndex)).toNumber();
    this.minStakeTimeInBlocks = (await quantstampStakingData.getPoolMinStakeTimeInBlocks(poolIndex)).toNumber();
    this.stakeCount = (await quantstampStakingData.getPoolStakeCount(poolIndex)).toNumber();
    this.depositQspWei = (await quantstampStakingData.getPoolDepositQspWei(poolIndex)).toNumber();
    this.state = (await quantstampStakingData.getPoolState(poolIndex)).toNumber();
    this.poolSizeQspWei = (await quantstampStakingData.getPoolSizeQspWei(poolIndex)).toNumber();
    this.minStakeStartBlock = (await quantstampStakingData.getPoolMinStakeStartBlock(poolIndex)).toNumber();
    this.lastAmountStaked = 0;
    return this;
  })();
};

// A single agent
var Agent = function(id, stakerAddress, budget, eyes) {
  this.id = id;
  this.eyes = eyes;
  this.address = stakerAddress;
  this.balance = budget;
  this.allowance = budget;
  // set from outside
  this.brain = null; 
  this.last_balance = 0;
  this.action = -1;
  // A state encoded as a binary number with the number of bits equal to the number of pools, 
  // indicates if the agent (staker) has placed a stake in a pool or not based on the bit's index. 
  // For example state 11 (in decimal) is equal to 1011 in binary indicating that the agent has stakes in the 1st, 2nd and 4th pools.
  // This also means that if in the World we have 5 pools there are 2^5-1 possible states.
  this.state = 0;
  this.numberOfStates = 2**numberOfPools;
};

Agent.prototype = {

  /**
   * Get property value of Env by fieldname
   * @param fieldname name of the property as `string`
   * @returns value or `undefined` of no value exists
   */
  get(fieldname) {
    return this[fieldname] ? this[fieldname] : undefined;
  },

  getNumStates: function() {
    return this.numberOfStates;
  },
  getMaxNumActions: function() {
    return numberOfActions;
  },
  allowedActions: function(s) {
    var actions = [];
    for (var i = 0; i < numberOfPools; i++) {
      if ((eyes[i].state == PoolState.Initialized
        || eyes[i].state == PoolState.NotViolatedFunded
        || eyes[i].state == PoolState.NotViolatedUnderfunded) 
        && stakeMultiplier.lte(this.balance)) { // staking allowed only if enough funds available
          actions.push(i*numberOfMethods);
      }

      if ((this.state & (1 << i)) != 0 // it means that this agent has a stake in pool i
        && (eyes[i].state == PoolState.Initialized
        || eyes[i].state == PoolState.NotViolatedUnderfunded
        || eyes[i].state == PoolState.PolicyExpired)) { 
        actions.push(i*numberOfMethods+1); // allow the agent to withdraw stakes from pool i
      }
    }
    console.log(dec2bin(this.state) + " Agent " + this.id + " has balance " + this.balance.toNumber() + " and approved " + this.allowance + " and can do: " + actions.join(' '));
    return actions;
  },
  forward: async function() {
    this.action = this.brain.decide(eyes.push(this.state));
    console.log("Agent " + this.id + " does " + this.action);
    csv_row += " " + this.action;
    csv_head += " ActionOfAgent" + this.id;

    for (var i = 0; i < numberOfPools; i++) {
      csv_head += " WithdrawInterestAgent" + this.id + " PoolId";
      try {
        if (eyes[i].minStakeStartBlock > 0
          && (eyes[i].state == PoolState.NotViolatedFunded
          || eyes[i].state == PoolState.NotViolatedUnderfunded)) {
          await qspb.withdrawInterest(i, {from : this.address});
          console.log("Agent " + this.id + " withdrew interest from pool " + i);
          csv_row += " 1 " + i;
        } else {
          csv_row += " 0 " + i;
        }
      } catch (err) {
        console.log("Agent " + this.id + " cannot withdraw interest from pool " + i + " " + err.message);
        csv_row += " -1 " + i;
      }
    }
    // recompute allowance
    quantstampToken.approve(qspb.address, this.balance, {from : this.address});
  },
  backward: async function() {
    // Reward function. This should be adapted to an accurate model of incentives
    var reward = 0;
    this.balance = new BigNumber((await Util.balanceOf(quantstampToken, this.address)).toString());
    this.allowance = await quantstampToken.allowance(this.address, qspb.address);
    

    if (this.action % numberOfMethods == 0) { // action was stakeFunds
      const poolIndex = (this.action % numberOfMultipliers) / numberOfMethods;
      var e = this.eyes[poolIndex];
      reward = (((e.maxPayoutQspWei / (e.stakeCount**3 + 1)) / e.payPeriodInBlocks) * (100 + e.bonusExpertFactor)) / 100;
      // take risk into account
      reward = (reward * (100 - pools[poolIndex].risk) - e.lastAmountStaked * pools[poolIndex].risk)/100;
      // add bribe
      reward += pools[poolIndex].bribe;
    } else { // action was withdrawStake
      reward = this.balance.minus(this.last_balance);
    }
    // apply QSP price rate
    reward *= qspPriceRate;
    console.log("Agent " + this.id + " gets reward: " + reward);
    csv_row += " " + reward + " " + this.balance.toNumber();
    csv_head += " RewardAgent" + this.id + " BalanceAgent" + this.id;
    this.brain.learn(reward);
    this.last_balance = this.balance;
  }
};

contract('QuantstampStaking: simulation script using smart agents', function(accounts) {
  let quantstampRegistry;
  let quantstampParameterizer;
  let voting;
  let currentPoolNumber;
  let balanceOfQspb = new BigNumber(0);

  const minDeposit = new BigNumber(Util.toQsp(TCRUtil.minDep));
  const oneHundredQsp = new BigNumber(Util.toQsp(100));
  const candidateContractBalance = oneHundredQsp;

  const owner = accounts[0];
  const stakeholder = [accounts[1], accounts[2], accounts[3]];
  const qspAdmin = accounts[4]; // QSP token owner
  const staker = [accounts[5], // expert staker
    accounts[6], // expert staker
    accounts[7], // non-expert staker
    accounts[8], // non-expert staker
    accounts[9]]; // expert staker
  // The following values are random, but large enough for the simulation to run numberOfIterations.
  const stakeholderBudget = [new BigNumber(Util.toQsp(154531)),
    new BigNumber(Util.toQsp(543213)), 
    new BigNumber(Util.toQsp(185924))];
  let stakerBudget = [];

  it("should instantiate the contracts, stakers and the pools", async function() {
    params = await readTextFile(inputFile);
    console.log(params[0]);
    numberOfIterations = parseInt(params[1]);
    numberOfAgents = parseInt(params[2]);
    numberOfPools = parseInt(params[3]);
    qspPriceRate = parseInt(params[4]);
    changeIteration = parseInt(params[5]);
    newQspPrice = parseInt(params[6]);
    qspPriceChange[changeIteration] = newQspPrice;
    // instantiate QSP Token
    quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
    // instantiate Security Expert TCR
    voting = await Voting.new(quantstampToken.address);
    quantstampParameterizer = await QuantstampParameterizer.new();
    await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
    quantstampRegistry = await QuantstampStakingRegistry.new();
    await quantstampRegistry.init(quantstampToken.address, voting.address, quantstampParameterizer.address, 'QSPtest');
    const wrapper = await RegistryWrapper.new(quantstampRegistry.address);
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    // instantiate Assurance Protocol Data contract
    quantstampStakingData = await QuantstampStakingData.new(quantstampToken.address);
    // instantiate Assurance Protocol contract
    qspb = await QuantstampStaking.new(quantstampToken.address, wrapper.address,
      quantstampStakingData.address, {from: owner});
    await quantstampStakingData.setWhitelistAddress(qspb.address);
    // initialize stakers
    for(var k = 0; k < numberOfAgents; k++) {
      var index = 7+k*4;
      stakerBudget[k] = new BigNumber(Util.toQsp(parseInt(params[index])));
      var iterationAdded = parseInt(params[index+1]);
      if (expertListChange[iterationAdded] == null) {
        expertListChange[iterationAdded] = [(k+1)];
      } else {
        expertListChange[iterationAdded].push(k+1);
      }
      var iterationRemoved = parseInt(params[index+2]);
      if (expertListChange[iterationRemoved] == null) {
        expertListChange[iterationRemoved] = [(-k-1)];
      } else {
        expertListChange[iterationRemoved].push(-k-1);
      }
      await quantstampToken.transfer(staker[k], stakerBudget[k], {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget[k], {from : staker[k]});
      await quantstampToken.approve(quantstampRegistry.address, minDeposit.times(100), {from : staker[k]});
    }
    // initialize pools
    for(k = 0; k < numberOfPools; k++) {
      var index = 27+k*13;
      pools.push({
        'candidateContract' : Util.ZERO_ADDRESS,
        'contractPolicy' : Util.ZERO_ADDRESS,
        'owner' : stakeholder[parseInt(params[index])],
        'maxPayoutQspWei' : new BigNumber(Util.toQsp(parseInt(params[index+1]))),
        'minStakeQspWei' : new BigNumber(Util.toQsp(parseInt(params[index+2]))),
        'depositQspWei' : new BigNumber(Util.toQsp(parseInt(params[index+4]))),
        'bonusExpertFactor' : new BigNumber(parseInt(params[index+5])),
        'bonusFirstExpertFactor' : new BigNumber(parseInt(params[index+6])),
        'firstExpertStaker' : Util.ZERO_ADDRESS,
        'payPeriodInBlocks' : new BigNumber(parseInt(params[index+7])),
        'minStakeTimeInBlocks' : new BigNumber(parseInt(params[index+8])),
        'timeoutInBlocks' : new BigNumber(parseInt(params[index+9])),
        'timeOfStateInBlocks' : new BigNumber(0),
        'urlOfAuditReport' : "URL",
        'state' : PoolState.Initialized,
        'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
        'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
        'stakeCount' : new BigNumber(0),
        'index' : k,
        'poolName' : "Orange Pool",
        'maxTotalStake' : new BigNumber(Util.toQsp(parseInt(params[index+3]))),
        'risk': parseInt(params[index+10]),
        'bribe': parseInt(params[index+11]),
        'iterationViolated': parseInt(params[index+12])
      });
      pools[k].candidateContract = await CandidateContract.new(candidateContractBalance);
      pools[k].contractPolicy = await TrivialBackdoorPolicy.new(pools[k].candidateContract.address);
      await quantstampToken.transfer(pools[k].owner, stakeholderBudget[parseInt(params[index])], {from : owner});
      await quantstampToken.approve(qspb.address, stakeholderBudget[parseInt(params[index])], {from : pools[k].owner});
      await Util.instantiatePool(qspb, pools[k]);
    }
  });

  it("should do the simulation", async function() {
    this.timeout(1000000000);
    // The eyes are the sensors which observe the parameters of all pools
    for(var k = 0; k < numberOfPools; k++) { 
      eyes.push(await new Eye(quantstampStakingData, k)); 
    }
    // The world contains agents which interact with the protocol
    var w = new World();
    w.agents = [];
    for(k = 0; k < numberOfAgents; k++) {
      var a = new Agent(k, staker[k], stakerBudget[k], eyes);
      // Termporal-Difference Reinforcement Learning
      a.brain = new RL.TDSolver(a, opt);
      w.agents.push(a);
    }

    var sortedIterations = [1];
    // add all keys (representing iterations) in the list
    for (var i in qspPriceChange) {
      sortedIterations.push(parseInt(i));
    }
    // add pool violation iterations
    for (i = 0; i < numberOfPools; i++) {
      sortedIterations.push(parseInt(pools[i].iterationViolated));
    }
    sortedIterations.push(numberOfIterations);
    // sort iterations in chronological order
    sortedIterations = sortedIterations.sort(function(a, b){return a-b;});
    // only keep unique elements from list
    var unique = sortedIterations.filter(onlyUnique);
    sortedIterations = unique;
    console.log(sortedIterations);

    for (i = 1; i <= sortedIterations.length; i++) {
      // Each agent in the world can do one protocol interaction per iteration
      for (k = sortedIterations[i-1]; k <= sortedIterations[i]; k++) {
        await w.tick();
      }
      if (sortedIterations[i] > numberOfIterations) {
        break;
      }
      console.log("Update policy status");
      // Check if any of the pool policies needs to be violated at this iteration
      for(var l = 0; l < numberOfPools; l++) {
        if (sortedIterations[i] == pools[l].iterationViolated) {
          await pools[l].contractPolicy.updateStatus(true);
          // Set the state of the agents such that they don't see their stake in the violated pool anymore
          for (var j = 0; j < w.agents.length; j++) {
            const a = w.agents[j];
            a.state &= (a.numberOfStates ^ (1 << l));
          }
        }
      }
      // Check if there are any changes in the price of QSP
      for (l in qspPriceChange) {
        if (sortedIterations[i] == l) {
          qspPriceChange = qspPriceChange[l];
        }
      }
      console.log("Update CCR");
      // Check if some experts need to be added or removed from the whitelist
      for (l in expertListChange) {
        if (sortedIterations[i] == l) {
          for (j in expertListChange[l]) {
            if (expertListChange[l][j] > 0) {
              const index = expertListChange[l][j] - 1;
              await TCRUtil.addToWhitelist(staker[index], TCRUtil.minDep, staker[index], quantstampRegistry);
            } else {
              const index = Math.abs(expertListChange[l][j]) - 1;
              await TCRUtil.removeFromWhitelist(staker[index], staker[index], quantstampRegistry);
            }
          }
        }
      } // end for (l in expertListChange)
      console.log("End of iteration");
    } // end for (var i = 1; i <= sortedIterations.length; i++)
  });
});
