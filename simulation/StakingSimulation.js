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
let poolList = [];
let qspb;
let quantstampStakingData;
let quantstampToken;
let csv_head;
let csv_row;

/**************************************************
 * START of config parameters for simulation stript
***************************************************/
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
// Allowed range is 1 to 1.000.000. The rate at which QSP is seen with respect to a ficticious currency. It can go up/down
var qspPriceRate = 1000;
// Allowed range for list keys is 1 to numberOfIterations and for list values it is 1 to 1000.000.
var qspPriceChange = {
  50 : 100,
  150 : 10000};
// Allowed range for list keys is 1 to numberOfIterations and for list values it is 1 to numberOfAgents. Add minus in front to remove from list.
var expertListChange = {
  50 : [1, 3],
  100 : [-1, 4]
}

// Modify the following parameters only if you know what you are doing.
const opt = new RL.TDOpt();
opt.setUpdate('qlearn'); // or 'sarsa'
opt.setGamma(0.9);
opt.setEpsilon(0.2);
opt.setAlpha(0.1);
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
      eyes[i].depositQspWei = (await quantstampStakingData.getPoolDepositQspWei(i)).toNumber();
      console.log("Pool #" + i + ": has a deposit of " + eyes[i].depositQspWei);
      csv_row += " " + eyes[i].depositQspWei;
      csv_head += " DepositQspWei" + i;
      eyes[i].state = (await quantstampStakingData.getPoolState(i)).toNumber();
      console.log("Pool #" + i + ": is in state " + eyes[i].state);
      csv_row += " " + eyes[i].state;
      csv_head += " PoolState" + i;
      eyes[i].poolSizeQspWei = (await quantstampStakingData.getPoolSizeQspWei(i)).toNumber();
      console.log("Pool #" + i + ": has a size of " + eyes[i].poolSizeQspWei);
      csv_row += " " + eyes[i].poolSizeQspWei;
      csv_head += " PoolSizeQspWei" + i;
      eyes[i].minStakeStartBlock = (await quantstampStakingData.getPoolMinStakeStartBlock(i)).toNumber();
      console.log("Pool #" + i + ": has a minStakeStartBlock of " + eyes[i].minStakeStartBlock);
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
      var tmp = a.action % numberOfMultipliers;
      var pool = Math.floor(tmp/numberOfMethods);
      eyes[pool].lastAmountStaked = (await quantstampStakingData.getPoolMinStakeQspWei(pool)).
        times(Math.floor(a.action / numberOfMultipliers)).toNumber();
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
          console.log(err.message);
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
          console.log(err.message);
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
    return this;
  })();
};

// A single agent
var Agent = function(id, stakerAddress, budget, eyes) {
  this.id = id;
  this.eyes = eyes;
  this.address = stakerAddress;
  this.balance = budget;
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
      if (eyes[i].state == PoolState.Initialized
        || eyes[i].state == PoolState.NotViolatedFunded
        || eyes[i].state == PoolState.NotViolatedUnderfunded) {
        for (var j = 1; j < numberOfMultipliers; j++) {
          if (this.balance >= j*eyes[i].minStakeQspWei) { // staking allowed only if enough funds available
            actions.push(j*numberOfMultipliers+i*numberOfMethods);
          }
        }
      }

      if ((s & (1 << i)) != 0 && eyes[i].state != PoolState.NotViolatedFunded) { // it means that this agent has a stake in pool i
        actions.push(i*numberOfMethods+1); // allow the agent to withdraw stakes from pool i
      }
    }
    console.log(dec2bin(this.state) + " Agent " + this.id + " can do: " + actions.join(' '));
    return actions;
  },
  forward: async function() {
    this.action = this.brain.decide(this.state);
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
  },
  backward: async function() {
    // Reward function. This should be adapted to an accurate model of incentives
    var reward = 0;
    this.balance = await Util.balanceOf(quantstampToken, this.address);

    if (this.action % numberOfMethods == 0) { // action was stakeFunds
      const poolIndex = (this.action % numberOfMultipliers) / numberOfMethods;
      var e = this.eyes[poolIndex];
      reward = (((e.maxPayoutQspWei / (e.stakeCount + 1)) / e.payPeriodInBlocks) * (100 + e.bonusExpertFactor)) / 100;
      // take risk into account
      reward = (reward * (100 - poolList[poolIndex].risk) - e.lastAmountStaked * poolList[poolIndex].risk)/100;
      // add bribe
      reward += poolList[poolIndex].bribe;
    } else { // action was withdrawStake
      reward = this.balance - this.last_balance;
    }
    // apply QSP price rate
    reward *= qspPriceRate;
    console.log("Agent " + this.id + " gets reward: " + reward);
    csv_row += " " + reward + " " + this.balance;
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
  const stakeholder1 = accounts[1]; // orange pool & white pool
  const stakeholder2 = accounts[2]; // gray pool & blue pool
  const stakeholder3 = accounts[3]; // purple pool
  const qspAdmin = accounts[4]; // QSP token owner
  const staker = [accounts[5], // expert staker
    accounts[6], // expert staker
    accounts[7], // non-expert staker
    accounts[8], // non-expert staker
    accounts[9]]; // expert staker
  // The following values are random, but large enough for the simulation to run numberOfIterations.
  const stakeholder1Budget = new BigNumber(Util.toQsp(154531));
  const stakeholder2Budget = new BigNumber(Util.toQsp(543213));
  const stakeholder3Budget = new BigNumber(Util.toQsp(185924));
  const staker1StakeOrangePool = new BigNumber(Util.toQsp(1154));
  const staker1StakeWhitePool = new BigNumber(Util.toQsp(123));
  const staker1StakeBluePool = new BigNumber(Util.toQsp(565));
  const staker2StakeOrangePool = new BigNumber(Util.toQsp(1487));
  const staker2StakePurplePool = new BigNumber(Util.toQsp(196));
  const staker3StakeGrayPool = new BigNumber(Util.toQsp(1379));
  const staker4StakeOrangePool = new BigNumber(Util.toQsp(1550));
  const staker4StakePurplePool = new BigNumber(Util.toQsp(134));
  const staker5StakeOrangePool = new BigNumber(Util.toQsp(1042));
  const staker5StakeGrayPool = new BigNumber(Util.toQsp(129));
  const staker5StakeWhitePool = new BigNumber(Util.toQsp(296));
  
  const stakerBudget = [staker1StakeOrangePool.plus(staker1StakeWhitePool).plus(staker1StakeBluePool).plus(minDeposit),
    staker2StakeOrangePool.plus(staker2StakePurplePool).plus(minDeposit),
    staker3StakeGrayPool,
    staker4StakeOrangePool.plus(staker4StakePurplePool),
    staker5StakeOrangePool.plus(staker5StakeGrayPool).plus(staker5StakeWhitePool).plus(minDeposit)];

  // Orange Pool params
  let orangePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder1,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(10)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(40)),
    'depositQspWei' : new BigNumber(Util.toQsp(15000)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(100),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(20),
    'minStakeTimeInBlocks' : new BigNumber(10000000),
    'timeoutInBlocks' : new BigNumber(200000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "URL",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Orange Pool",
    'maxTotalStake' : new BigNumber(Util.toQsp(0)),
    'risk': 20,
    'bribe': 0,
    'iterationViolated': 0
  };

  // Gray Pool params
  let grayPoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder2,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(2)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(20)),
    'depositQspWei' : new BigNumber(Util.toQsp(20000)),
    'bonusExpertFactor' : new BigNumber(150),
    'bonusFirstExpertFactor' : new BigNumber(180),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(40),
    'minStakeTimeInBlocks' : new BigNumber(1600000),
    'timeoutInBlocks' : new BigNumber(500000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "https://quantstamp.atlassian.net/wiki/spaces/QUAN/pages/35356673/Presentations+Repository",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Gray Pool",
    'maxTotalStake' : new BigNumber(Util.toQsp(0)),
    'risk': 20,
    'bribe': 1,
    'iterationViolated': 0
  };

  // White Pool params
  let whitePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder1,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(10)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(50)),
    'depositQspWei' : new BigNumber(Util.toQsp(10000)),
    'bonusExpertFactor' : new BigNumber(10),
    'bonusFirstExpertFactor' : new BigNumber(20),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(150),
    'minStakeTimeInBlocks' : new BigNumber(1000000),
    'timeoutInBlocks' : new BigNumber(100000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "White pool report",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "White Pool",
    'maxTotalStake' : new BigNumber(Util.toQsp(0)),
    'risk': 0,
    'bribe': 0,
    'iterationViolated': 100
  };

  // Purple Pool params
  let purplePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder3,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(10)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(20)),
    'depositQspWei' : new BigNumber(Util.toQsp(5000)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(0),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(5),
    'minStakeTimeInBlocks' : new BigNumber(1000000),
    'timeoutInBlocks' : new BigNumber(500000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "Purple pool report",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Purple Pool",
    'maxTotalStake' : new BigNumber(Util.toQsp(0)),
    'risk': 50,
    'bribe': 0,
    'iterationViolated': 0
  };
  // Blue Pool params
  let bluePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder2,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(10)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(50)),
    'depositQspWei' : new BigNumber(Util.toQsp(10000)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(0),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(500),
    'minStakeTimeInBlocks' : new BigNumber(10000000),
    'timeoutInBlocks' : new BigNumber(500000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "Blue pool report",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Blue Pool",
    'maxTotalStake' : new BigNumber(Util.toQsp(0)),
    'risk': 0,
    'bribe': 10,
    'iterationViolated': 100
  };

  it("should instantiate the Security Expert TCR and add staker1 before the Assurance Contract is created", async function() {
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
    // award budget to staker1
    await quantstampToken.transfer(staker[0], stakerBudget[0], {from : owner});
    await quantstampToken.transfer(staker[1], stakerBudget[1], {from : owner});
    await quantstampToken.transfer(staker[2], stakerBudget[2], {from : owner});
    await quantstampToken.transfer(staker[3], stakerBudget[3], {from : owner});
    await quantstampToken.transfer(staker[4], stakerBudget[4], {from : owner});
    // allow stakers to be added to the whitelist
    await quantstampToken.approve(quantstampRegistry.address, minDeposit.times(100), {from : staker[0]});
    await quantstampToken.approve(quantstampRegistry.address, minDeposit.times(100), {from : staker[1]});
    await quantstampToken.approve(quantstampRegistry.address, minDeposit.times(100), {from : staker[2]});
    await quantstampToken.approve(quantstampRegistry.address, minDeposit.times(100), {from : staker[3]});
    await quantstampToken.approve(quantstampRegistry.address, minDeposit.times(100), {from : staker[4]});
    // instantiate Assurance Protocol Data contract
    quantstampStakingData = await QuantstampStakingData.new(quantstampToken.address);
    // instantiate Assurance Protocol contract
    qspb = await QuantstampStaking.new(quantstampToken.address, wrapper.address,
      quantstampStakingData.address, {from: owner});
    await quantstampStakingData.setWhitelistAddress(qspb.address);

    // allow the Assurance protocol to transfer funds from all stakers
    await quantstampToken.approve(qspb.address, stakerBudget[0], {from : staker[0]});
    await quantstampToken.approve(qspb.address, stakerBudget[1], {from : staker[1]});
    await quantstampToken.approve(qspb.address, stakerBudget[2], {from : staker[2]});
    await quantstampToken.approve(qspb.address, stakerBudget[3], {from : staker[3]});
    await quantstampToken.approve(qspb.address, stakerBudget[4], {from : staker[4]});
  });

  it("should create the Orange Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the orange pool
    orangePoolParams.candidateContract = await CandidateContract.new(candidateContractBalance);
    orangePoolParams.contractPolicy = await TrivialBackdoorPolicy.new(orangePoolParams.candidateContract.address);
    // award budget to stakeholder 1 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(orangePoolParams.owner, stakeholder1Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder1Budget, {from : orangePoolParams.owner});
    // quick check that balance is zero
    assert.equal(balanceOfQspb.toNumber(), (await qspb.getBalanceQspWei()));
    // create orange pool
    await Util.instantiatePool(qspb, orangePoolParams);
    // update the time when the status of the pool changed
    orangePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await quantstampStakingData.getPoolsLength();
    assert.equal(currentPoolNumber, 1);
    orangePoolParams.index = 0;
    poolList.push(orangePoolParams);
    // the balance of the Assurance contract should be increased by the amount deposited in the orange pool
    balanceOfQspb = balanceOfQspb.plus(orangePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await Util.assertEntirePoolState(orangePoolParams, balanceOfQspb, quantstampStakingData);
  });

  it("should create the Gray Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the gray pool
    grayPoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : grayPoolParams.owner});
    grayPoolParams.contractPolicy = await TrivialBackdoorPolicy.new(grayPoolParams.candidateContract.address);
    // award budget to stakeholder2 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(grayPoolParams.owner, stakeholder2Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder2Budget, {from : grayPoolParams.owner});
    // create pool
    await Util.instantiatePool(qspb, grayPoolParams);
    // update the time when the status of the pool changed
    grayPoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await quantstampStakingData.getPoolsLength();
    assert.equal(currentPoolNumber, 2);
    grayPoolParams.index = 1;
    poolList.push(grayPoolParams);
    // the balance of the Assurance contract should be increased by the amount deposited in the gray pool
    balanceOfQspb = balanceOfQspb.plus(grayPoolParams.depositQspWei);
    // check that all pool properties are as expected
    await Util.assertEntirePoolState(grayPoolParams, balanceOfQspb, quantstampStakingData);
  });

  it("should create the White Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the white pool
    whitePoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : whitePoolParams.owner});
    whitePoolParams.contractPolicy = await TrivialBackdoorPolicy.new(whitePoolParams.candidateContract.address);
    // create pool
    await Util.instantiatePool(qspb, whitePoolParams);
    // update the time when the status of the pool changed
    whitePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await quantstampStakingData.getPoolsLength();
    assert.equal(currentPoolNumber, 3);
    whitePoolParams.index = 2;
    poolList.push(whitePoolParams);
    // the balance of the Assurance contract should be increased by the amount deposited in the white pool
    balanceOfQspb = balanceOfQspb.plus(whitePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await Util.assertEntirePoolState(whitePoolParams, balanceOfQspb, quantstampStakingData);
  });

  it("should create the Purple Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the purple pool
    purplePoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : purplePoolParams.owner});
    purplePoolParams.contractPolicy = await TrivialBackdoorPolicy.new(purplePoolParams.candidateContract.address);
    // award budget to stakeholder 3 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(purplePoolParams.owner, stakeholder3Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder3Budget, {from : purplePoolParams.owner});
    // create pool
    await Util.instantiatePool(qspb, purplePoolParams);
    // update the time when the status of the pool changed
    purplePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await quantstampStakingData.getPoolsLength();
    assert.equal(currentPoolNumber, 4);
    purplePoolParams.index = 3;
    poolList.push(purplePoolParams);
    // the balance of the Assurance contract should be increased by the amount deposited in the purple pool
    balanceOfQspb = balanceOfQspb.plus(purplePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await Util.assertEntirePoolState(purplePoolParams, balanceOfQspb, quantstampStakingData);
  });

  it("should create the Blue Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the blue pool
    bluePoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : bluePoolParams.owner});
    bluePoolParams.contractPolicy = await TrivialBackdoorPolicy.new(bluePoolParams.candidateContract.address);
    // create pool
    await Util.instantiatePool(qspb, bluePoolParams);
    // update the time when the status of the pool changed
    bluePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await quantstampStakingData.getPoolsLength();
    assert.equal(currentPoolNumber, 5);
    bluePoolParams.index = 4;
    poolList.push(bluePoolParams);
    // the balance of the Assurance contract should be increased by the amount deposited in the blue pool
    balanceOfQspb = balanceOfQspb.plus(bluePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await Util.assertEntirePoolState(bluePoolParams, balanceOfQspb, quantstampStakingData);
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

    sortedIterations = [1];
    // add all keys (representing iterations) in the list
    for (var i in qspPriceChange) {
      sortedIterations.push(i);
    }
    // add pool violation iterations
    for (var i = 0; i < numberOfPools; i++) {
      sortedIterations.push(poolList[i].iterationViolated);
    }
    sortedIterations.push(numberOfIterations);
    // only keep unique elements from list
    sortedIterations = [...new Set(sortedIterations)];
    // sort iterations in chronological order
    sortedIterations = sortedIterations.sort(function(a, b){return a-b});
    console.log("Sorted List of iterations: " + sortedIterations);

    for (var i = 1; i <= sortedIterations.length; i++) {
      // Each agent in the world can do one protocol interaction per iteration
      for (k = sortedIterations[i-1]; k <= sortedIterations[i]; k++) {
        await w.tick();
      }
      // Check if any of the pool policies needs to be violated at this iteration
      for(var l = 0; l < numberOfPools; l++) {
        if (sortedIterations[i] == poolList[l].iterationViolated) {
          await poolList[l].contractPolicy.updateStatus(true);
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
    } // end for (var i = 1; i <= sortedIterations.length; i++)
  });
});
