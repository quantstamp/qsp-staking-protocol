const QuantstampStaking = artifacts.require('QuantstampStaking');
const ZeroBalancePolicy = artifacts.require('policies/ZeroBalancePolicy');
const OwnerNotChangedPolicy = artifacts.require('policies/OwnerNotChangedPolicy');
const CandidateContract = artifacts.require('CandidateContract');
const CandidateToken = artifacts.require('CandidateToken');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const TCRUtil = require('./tcrutils.js');
const Util = require("./util.js");
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));

contract('QuantstampStaking: complex functional test', function(accounts) {
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

  async function instantiatePool(qspb, poolParams) {
    await qspb.createPool(poolParams.candidateContract.address,
      poolParams.contractPolicy.address,
      poolParams.maxPayoutQspWei,
      poolParams.minStakeQspWei,
      poolParams.depositQspWei,
      poolParams.bonusExpertFactor,
      poolParams.bonusFirstExpertFactor,
      poolParams.payPeriodInBlocks,
      poolParams.minStakeTimeInBlocks,
      poolParams.timeoutInBlocks,
      poolParams.urlOfAuditReport,
      poolParams.poolName,
      {from: poolParams.owner});
  }

  async function assertEntirePoolState(qspb, poolParams, balanceOfQspb) {
    assert.equal(poolParams.candidateContract.address, await qspb.getPoolCandidateContract(poolParams.index));
    assert.equal(poolParams.contractPolicy.address, await qspb.getPoolContractPolicy(poolParams.index));
    assert.equal(poolParams.owner, await qspb.getPoolOwner(poolParams.index));
    assert.equal(poolParams.maxPayoutQspWei.toNumber(), (await qspb.getPoolMaxPayoutQspWei(poolParams.index)).toNumber());
    assert.equal(poolParams.minStakeQspWei.toNumber(), (await qspb.getPoolMinStakeQspWei(poolParams.index)).toNumber());
    assert.equal(poolParams.depositQspWei.toNumber(), (await qspb.getPoolDepositQspWei(poolParams.index)).toNumber());
    assert.equal(poolParams.bonusExpertFactor.toNumber(), (await qspb.getPoolBonusExpertFactor(poolParams.index)).toNumber());
    assert.equal(poolParams.bonusFirstExpertFactor.toNumber(), (await qspb.getPoolBonusFirstExpertFactor(poolParams.index)).toNumber());
    assert.equal(poolParams.firstExpertStaker, await qspb.getPoolFirstExpertStaker(poolParams.index));
    assert.equal(poolParams.payPeriodInBlocks.toNumber(), (await qspb.getPoolPayPeriodInBlocks(poolParams.index)).toNumber());
    assert.equal(poolParams.minStakeTimeInBlocks.toNumber(), (await qspb.getPoolMinStakeTimeInBlocks(poolParams.index)).toNumber());
    assert.equal(poolParams.timeoutInBlocks.toNumber(), (await qspb.getPoolTimeoutInBlocks(poolParams.index)).toNumber());
    assert.equal(poolParams.timeOfStateInBlocks.toNumber(), (await qspb.getPoolTimeOfStateInBlocks(poolParams.index)).toNumber());
    assert.equal(poolParams.urlOfAuditReport, await qspb.getPoolUrlOfAuditReport(poolParams.index));
    assert.equal(poolParams.state, await qspb.getPoolState(poolParams.index));
    assert.equal(poolParams.totalStakeQspWei.toNumber(), (await qspb.getPoolTotalStakeQspWei(poolParams.index)).toNumber());
    assert.equal(poolParams.poolSizeQspWei.toNumber(), (await qspb.getPoolSizeQspWei(poolParams.index)).toNumber());
    assert.equal(poolParams.stakeCount.toNumber(), (await qspb.getPoolStakeCount(poolParams.index)).toNumber());
    assert.equal(poolParams.poolName, await qspb.getPoolName(poolParams.index));
    assert.equal(balanceOfQspb.toNumber(), (await qspb.balanceQspWei.call()));
    return true;
  }

  let qspb;
  let quantstampToken;
  let quantstampRegistry;
  let quantstampParameterizer;
  let voting;
  let currentPoolNumber;
  let balanceOfQspb = new BigNumber(0);
  let staker2StakeBlock;
  let staker3StakeBlock;
  let staker4StakeBlock;
  let staker5StakeBlock;
  let staker1PayoutOrangePool;
  let staker2PayoutOrangePool;
  let staker3PayoutGrayPool;
  let staker4PayoutOrangePool;
  let staker5PayoutOrangePool;
  let staker5PayoutGrayPool;

  const minDeposit = new BigNumber(Util.toQsp(TCRUtil.minDep));
  const oneHundredQsp = new BigNumber(Util.toQsp(100));
  const candidateContractBalance = oneHundredQsp;

  const owner = accounts[0];
  const stakeholder1 = accounts[1]; // orange pool & white pool
  const stakeholder2 = accounts[2]; // gray pool & blue pool
  const stakeholder3 = accounts[3]; // purple pool
  const qspAdmin = accounts[4]; // QSP token owner
  const staker1 = accounts[5]; // expert staker
  const staker2 = accounts[6]; // expert staker
  const staker3 = accounts[7]; // non-expert staker
  const staker4 = accounts[8]; // non-expert staker
  const staker5 = accounts[9]; // expert staker

  const stakeholder1Budget = new BigNumber(Util.toQsp(15453));
  const stakeholder2Budget = new BigNumber(Util.toQsp(54321));
  const stakeholder3Budget = new BigNumber(Util.toQsp(18592));
  const newDepostStakeholder2GrayPool = new BigNumber(Util.toQsp(11234));

  const staker1StakeOrangePool = new BigNumber(Util.toQsp(154));
  const staker1StakeWhitePool = new BigNumber(Util.toQsp(123));
  const staker1StakeBluePool = new BigNumber(Util.toQsp(565));
  const staker2StakeOrangePool = new BigNumber(Util.toQsp(487));
  const staker2StakePurplePool = new BigNumber(Util.toQsp(196));
  const staker3StakeGrayPool = new BigNumber(Util.toQsp(379));
  const staker4StakeOrangePool = new BigNumber(Util.toQsp(550));
  const staker4StakePurplePool = new BigNumber(Util.toQsp(134));
  const staker5StakeOrangePool = new BigNumber(Util.toQsp(42));
  const staker5StakeGrayPool = new BigNumber(Util.toQsp(129));
  const staker5StakeWhitePool = new BigNumber(Util.toQsp(296));

  const staker1Budget = staker1StakeOrangePool.plus(staker1StakeWhitePool).plus(staker1StakeBluePool).plus(minDeposit);
  const staker2Budget = staker2StakeOrangePool.plus(staker2StakePurplePool).plus(minDeposit);
  const staker3Budget = staker3StakeGrayPool;
  const staker4Budget = staker4StakeOrangePool.plus(staker4StakePurplePool);
  const staker5Budget = staker5StakeOrangePool.plus(staker5StakeGrayPool).plus(staker5StakeWhitePool).plus(minDeposit);

  // Orange Pool params
  let orangePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder1,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(100)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(400)),
    'depositQspWei' : new BigNumber(Util.toQsp(150)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(100),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(20),
    'minStakeTimeInBlocks' : new BigNumber(1000000),
    'timeoutInBlocks' : new BigNumber(2000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "URL",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Orange Pool",
  };

  // Gray Pool params
  let grayPoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder2,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(200)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(200)),
    'depositQspWei' : new BigNumber(Util.toQsp(20000)),
    'bonusExpertFactor' : new BigNumber(150),
    'bonusFirstExpertFactor' : new BigNumber(180),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(40),
    'minStakeTimeInBlocks' : new BigNumber(160),
    'timeoutInBlocks' : new BigNumber(5000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "https://quantstamp.atlassian.net/wiki/spaces/QUAN/pages/35356673/Presentations+Repository",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Gray Pool",
  };

  // White Pool params
  let whitePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder1,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(1000)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(500000)),
    'depositQspWei' : new BigNumber(Util.toQsp(10000)),
    'bonusExpertFactor' : new BigNumber(10),
    'bonusFirstExpertFactor' : new BigNumber(20),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(150),
    'minStakeTimeInBlocks' : new BigNumber(100000),
    'timeoutInBlocks' : new BigNumber(10),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "White pool report",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "White Pool",
  };

  // Purple Pool params
  let purplePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder3,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(10000)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(200)),
    'depositQspWei' : new BigNumber(Util.toQsp(5000)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(0),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(5),
    'minStakeTimeInBlocks' : new BigNumber(100000),
    'timeoutInBlocks' : new BigNumber(5000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "Purple pool report",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Purple Pool",
  };
  // Blue Pool params
  let bluePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder2,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(1000)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(500)),
    'depositQspWei' : new BigNumber(Util.toQsp(10)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(0),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(500),
    'minStakeTimeInBlocks' : new BigNumber(1000),
    'timeoutInBlocks' : new BigNumber(5000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "Blue pool report",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Blue Pool",
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
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    // award budget to staker1
    await quantstampToken.transfer(staker1, staker1Budget, {from : owner});
    // add staker1 to Security Expert TCR
    await quantstampToken.approve(quantstampRegistry.address, minDeposit, {from : staker1});
    await TCRUtil.addToWhitelist(staker1, TCRUtil.minDep, staker1, quantstampRegistry);
    // instantiate Assurance Protocol contract
    qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
    // check if staker1 is considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isTrue(await qspb.isExpert(staker1));
    // allow the Assurance protocol to transfer funds from staker1
    await quantstampToken.approve(qspb.address, staker1Budget, {from : staker1});
  });

  it("should not make any difference if staker2 and staker5 are added to the TCR after the Assrunce contract was instantiated", async function() {
    // award budget to staker2
    await quantstampToken.transfer(staker2, staker2Budget, {from : owner});
    // check if staker2 is not considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isFalse(await qspb.isExpert(staker2));
    // add staker2 to Security Expert TCR
    await quantstampToken.approve(quantstampRegistry.address, minDeposit, {from : staker2});
    await TCRUtil.addToWhitelist(staker2, TCRUtil.minDep, staker2, quantstampRegistry);
    // check if staker2 is considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isTrue(await qspb.isExpert(staker2));
    // award budget to staker5
    await quantstampToken.transfer(staker5, staker5Budget, {from : owner});
    // add staker5 to Security Expert TCR
    await quantstampToken.approve(quantstampRegistry.address, minDeposit, {from : staker5});
    await TCRUtil.addToWhitelist(staker5, TCRUtil.minDep, staker5, quantstampRegistry);
    // check if staker5 is considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isTrue(await qspb.isExpert(staker5));
  });

  it("should create the Orange Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the orange pool
    orangePoolParams.candidateContract = await CandidateContract.new(candidateContractBalance);
    orangePoolParams.contractPolicy = await ZeroBalancePolicy.new();
    // award budget to stakeholder 1 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(orangePoolParams.owner, stakeholder1Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder1Budget, {from : orangePoolParams.owner});
    // quick check that balance is zero
    assert.equal(balanceOfQspb.toNumber(), (await qspb.balanceQspWei.call()));
    // create orange pool
    await instantiatePool(qspb, orangePoolParams);
    // update the time when the status of the pool changed
    orangePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 1);
    orangePoolParams.index = 0;
    // the balance of the Assurance contract should be increased by the amount deposited in the orange pool
    balanceOfQspb = balanceOfQspb.plus(orangePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should place a stake for staker1 in the Orange Pool that is smaller than the minimum stake, which keeps the pool in the same state", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.Initialized);
    // staker1 places a stake in the Orange Pool
    await qspb.stakeFunds(orangePoolParams.index, staker1StakeOrangePool, {from : staker1});
    // since staker1 is a security expert on the TCR, the pool should update its firstExpertStaker field
    orangePoolParams.firstExpertStaker = staker1;
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(staker1StakeOrangePool);
    staker1PayoutOrangePool = staker1StakeOrangePool.times(orangePoolParams.bonusExpertFactor.plus(100)).
      times(orangePoolParams.bonusFirstExpertFactor.plus(100)).dividedBy(new BigNumber(100).pow(2));
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(staker1PayoutOrangePool);
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(staker1StakeOrangePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should place a stake for staker2 in the Orange Pool, which causes the pool to transition into the NotViolatedFunded state", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.Initialized);
    // allow the Assurance protocol to transfer funds from staker2
    await quantstampToken.approve(qspb.address, staker2Budget, {from : staker2});
    // staker2 places a stake in the Orange Pool
    await qspb.stakeFunds(orangePoolParams.index, staker2StakeOrangePool, {from : staker2});
    staker2StakeBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // since the total amount staked in this pool is not over the minimum stake, the pool should transition to the NotViolatedFunded state
    orangePoolParams.state = PoolState.NotViolatedFunded;
    orangePoolParams.timeOfStateInBlocks = staker2StakeBlock;
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(staker2StakeOrangePool);
    staker2PayoutOrangePool = staker2StakeOrangePool.times(orangePoolParams.bonusExpertFactor.pow(2).plus(new BigNumber(100).pow(2))).
      dividedBy(new BigNumber(100).pow(2));
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(staker2PayoutOrangePool);
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(staker2StakeOrangePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should place a stake for staker5 in the Orange Pool, which keeps the pool in the same state", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // allow the Assurance protocol to transfer funds from staker5
    await quantstampToken.approve(qspb.address, staker5Budget, {from : staker5});
    // staker5 places a stake in the Orange Pool already after some blocks since the orange pool has transitioned into the NotViolatedFunded state
    await qspb.stakeFunds(orangePoolParams.index, staker5StakeOrangePool, {from : staker5});
    staker5StakeBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(staker5StakeOrangePool);
    staker5PayoutOrangePool = staker5StakeOrangePool.times(orangePoolParams.bonusExpertFactor.pow(3).plus(new BigNumber(100).pow(3))).
      dividedBy(new BigNumber(100).pow(3));
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(staker5PayoutOrangePool);
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(staker5StakeOrangePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should create the Gray Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the gray pool
    grayPoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : grayPoolParams.owner});
    grayPoolParams.contractPolicy = await OwnerNotChangedPolicy.new(grayPoolParams.owner);
    // award budget to stakeholder2 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(grayPoolParams.owner, stakeholder2Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder2Budget, {from : grayPoolParams.owner});
    // create pool
    await instantiatePool(qspb, grayPoolParams);
    // update the time when the status of the pool changed
    grayPoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 2);
    grayPoolParams.index = 1;
    // the balance of the Assurance contract should be increased by the amount deposited in the gray pool
    balanceOfQspb = balanceOfQspb.plus(grayPoolParams.depositQspWei);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should reject the payout request of staker1 because the payout period has not yet passed for the orange pool", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // check that the pay period for the orange pool has not passed yet
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    assert.isTrue(currentBlock.lt(orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks)));
    // staker1 wants to withdraw his payout before the pay period has passed and gets rejected
    Util.assertTxFail(qspb.withdrawInterest(orangePoolParams.index, {from : staker1}));
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should place a stake for staker4 in the Orange Pool, which keeps the pool in the same state", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // award budget to staker4
    await quantstampToken.transfer(staker4, staker4Budget, {from : owner});
    // allow the Assurance protocol to transfer funds from staker5
    await quantstampToken.approve(qspb.address, staker4Budget, {from : staker4});
    // staker4 places a stake in the Orange Pool already after some blocks since the orange pool has transitioned into the NotViolatedFunded state
    await qspb.stakeFunds(orangePoolParams.index, staker4StakeOrangePool, {from : staker4});
    staker4StakeBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(staker4StakeOrangePool);
    staker4PayoutOrangePool = staker4StakeOrangePool.times(orangePoolParams.bonusExpertFactor.pow(4).plus(new BigNumber(100).pow(4))).
      dividedBy(new BigNumber(100).pow(4));
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(staker4PayoutOrangePool);
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(staker4StakeOrangePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should award the payout to staker1 after the first pay period has passed", async function() {
    // check that the pay period for the orange pool has not passed yet
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    assert.isTrue(currentBlock.lt(orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks)));
    // fast-forward to block where the first pay period ends
    const blocksUntilFirstPayout = orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilFirstPayout);
    // compute payout for staker1
    const payoutStaker1 = staker1PayoutOrangePool.times(orangePoolParams.maxPayoutQspWei).dividedToIntegerBy(orangePoolParams.poolSizeQspWei);
    const balanceOfStaker1 = (await quantstampToken.balanceOf(staker1)).toNumber();
    // staker1 wants to withdraw his payout and receives it
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker1});
    // check balance of staker 1
    assert.equal(payoutStaker1.plus(balanceOfStaker1).toNumber(), (await quantstampToken.balanceOf(staker1)).toNumber());
    // the deposit of the orange pool needs to be updated
    orangePoolParams.depositQspWei = orangePoolParams.depositQspWei.minus(payoutStaker1);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker1);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should place a stake for staker3 in the Gray Pool and transition the pool in the NotViolatedFunded state", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(grayPoolParams.index), PoolState.Initialized);
    // award budget to staker3
    await quantstampToken.transfer(staker3, staker3Budget, {from : owner});
    // allow the Assurance protocol to transfer funds from staker3
    await quantstampToken.approve(qspb.address, staker3Budget, {from : staker3});
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
    // check that the policy is not violated
    assert.equal(await grayPoolParams.contractPolicy.isViolated(grayPoolParams.candidateContract.address), false);
    // staker3 places a stake in the Gray Pool
    await qspb.stakeFunds(grayPoolParams.index, staker3StakeGrayPool, {from : staker3});
    staker3StakeBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // since staker3 is not an expert s/he receives a payout without any bonuses
    staker3PayoutGrayPool = staker3StakeGrayPool;
    // since the total amount staked in this pool is equal to the minimum stake, the pool should transition to the NotViolatedFunded state
    grayPoolParams.state = PoolState.NotViolatedFunded;
    grayPoolParams.timeOfStateInBlocks = staker3StakeBlock;
    // the total QSP staked should also increase, as well as the pool size and stake count
    grayPoolParams.totalStakeQspWei = staker3StakeGrayPool;
    grayPoolParams.poolSizeQspWei = staker3StakeGrayPool;
    grayPoolParams.stakeCount = grayPoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the gray pool
    balanceOfQspb = balanceOfQspb.plus(staker3StakeGrayPool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should not allow staker1 to withdraw his stake from the orange pool in the NotViolatedFunded", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // try to withdraw stake
    Util.assertTxFail(qspb.withdrawStake(orangePoolParams.index, {from : staker1}));
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should allow staker2 to receive his payout from the orange pool", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // compute payout for staker2
    const payoutStaker2 = staker2PayoutOrangePool.times(orangePoolParams.maxPayoutQspWei).dividedToIntegerBy(orangePoolParams.poolSizeQspWei);
    const balanceOfStaker2 = await quantstampToken.balanceOf(staker2);
    // staker2 wants to withdraw his payout and receives it
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker2});
    // the balance of staker2 should have increased
    assert.equal(balanceOfStaker2.plus(payoutStaker2).toNumber(), (await quantstampToken.balanceOf(staker2)).toNumber());
    // the deposit of the orange pool needs to be updated
    orangePoolParams.depositQspWei = orangePoolParams.depositQspWei.minus(payoutStaker2);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker2);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should not award a payout to staker4 because not enough time has passed since he has placed his stake", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    const balanceOfStaker4 = await quantstampToken.balanceOf(staker4);
    // check that the pay period for the orange pool has not passed yet
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    assert.isTrue(currentBlock.lt(staker4StakeBlock.plus(orangePoolParams.payPeriodInBlocks)));
    // staker4 wants to withdraw his payout before a pay period has passed since he staked and gets rejected, i.e. nothing gets transferred
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker4});
    // the balance of staker4 should have stayed the same
    assert.equal(balanceOfStaker4.toNumber(), (await quantstampToken.balanceOf(staker4)).toNumber());
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should award a payout to staker4 after enough time has passed since he has placed his stake", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    const balanceOfStaker4 = await quantstampToken.balanceOf(staker4);
    // fast-forward to block where the first pay period ends
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    const blocksUntilFirstPayout = staker4StakeBlock.plus(orangePoolParams.payPeriodInBlocks).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilFirstPayout);
    // staker4 wants to withdraw his payout and receives it
    const payoutStaker4 = staker4PayoutOrangePool.times(orangePoolParams.maxPayoutQspWei).dividedToIntegerBy(orangePoolParams.poolSizeQspWei);
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker4});
    // the balance of staker4 should have increased
    assert.equal(balanceOfStaker4.plus(payoutStaker4).toNumber(), (await quantstampToken.balanceOf(staker4)).toNumber());
    // the deposit of the orange pool needs to be updated
    orangePoolParams.depositQspWei = orangePoolParams.depositQspWei.minus(payoutStaker4);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker4);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should award a second payout to staker2 exactly at the end of the second pay period of the orange pool", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // check that the 2nd pay period has not passed
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    assert(orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks.times(2)) > currentBlock, "Already passed second pay period of orange pool");
    // fast-forward to block where the second pay period ends
    const blocksUntilSecondPayout = orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks.times(2)).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilSecondPayout);
    // compute payout for staker2
    const payoutStaker2 = staker2PayoutOrangePool.times(orangePoolParams.maxPayoutQspWei).dividedToIntegerBy(orangePoolParams.poolSizeQspWei);
    const balanceOfStaker2 = await quantstampToken.balanceOf(staker2);
    assert.equal(payoutStaker2.toNumber(), (await qspb.computePayout(orangePoolParams.index, staker2)).toNumber());
    // staker2 wants to withdraw his payout and receives it
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker2});
    // the balance of staker 2 should have increased
    assert.equal(payoutStaker2.plus(balanceOfStaker2).toNumber(), (await quantstampToken.balanceOf(staker2)).toNumber());
    // the deposit of the orange pool needs to be updated
    orangePoolParams.depositQspWei = orangePoolParams.depositQspWei.minus(payoutStaker2);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker2);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should award 2 payouts to staker5 who has already staked for 2 pay periods and not requested a payout yet", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    // check that the 2nd pay period has not passed for staker5
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // fast-forward to block where the second pay period ends
    const blocksUntilSecondPayout = staker5StakeBlock.plus(orangePoolParams.payPeriodInBlocks.times(2)).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilSecondPayout);
    // compute payout for staker5
    const payoutStaker5 = staker5PayoutOrangePool.times(2).times(orangePoolParams.maxPayoutQspWei).dividedToIntegerBy(orangePoolParams.poolSizeQspWei);
    const balanceOfStaker5 = await quantstampToken.balanceOf(staker5);
    assert.equal(payoutStaker5.toNumber(), (await qspb.computePayout(orangePoolParams.index, staker5)).toNumber());
    // staker5 wants to withdraw his 2 payouts and receives them
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker5});
    // the balance of staker 5 should have increased
    assert.equal(payoutStaker5.plus(balanceOfStaker5).toNumber(), (await quantstampToken.balanceOf(staker5)).toNumber());
    // the deposit of the orange pool needs to be updated
    orangePoolParams.depositQspWei = orangePoolParams.depositQspWei.minus(payoutStaker5);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker5);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should not be able to payout staker4 from the orange pool due to inssuficient funds, orange pool should then be cancelled", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.NotViolatedFunded);
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // fast-forward to block where the second pay period for staker4 starts
    const blocksUntilSecondPayout = staker4StakeBlock.plus(orangePoolParams.payPeriodInBlocks.times(2)).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilSecondPayout);
    // check that there is not enough deposit for paying out staker4
    const payoutStaker4 = staker4PayoutOrangePool.times(orangePoolParams.maxPayoutQspWei).dividedToIntegerBy(orangePoolParams.poolSizeQspWei);
    const balanceOfStaker4 = await quantstampToken.balanceOf(staker4);
    assert.equal(payoutStaker4.toNumber(), (await qspb.computePayout(orangePoolParams.index, staker4)).toNumber());
    assert.isTrue(payoutStaker4.gt(orangePoolParams.depositQspWei), "Deposit of orange pool is enough to payout staker4 " + orangePoolParams.depositQspWei + " > " + payoutStaker4);
    await qspb.withdrawInterest(orangePoolParams.index, {from : staker4});
    // the balance of staker 4 should have stayed the same
    assert.equal(balanceOfStaker4.toNumber(), (await quantstampToken.balanceOf(staker4)).toNumber());
    // the state of the orange pool needs to be updated
    orangePoolParams.state = PoolState.Cancelled;
    orangePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should allow stakers and the stakeholder to withdraw their funds from the orange pool in the cancelled state", async function() {
    // check that the pool is in the Cancelled state
    assert.equal(await qspb.getPoolState(orangePoolParams.index), PoolState.Cancelled);
    // check the balance of stakers
    const balanceOfStaker1 = await quantstampToken.balanceOf(staker1);
    const balanceOfStaker2 = await quantstampToken.balanceOf(staker2);
    const balanceOfStaker3 = await quantstampToken.balanceOf(staker3);
    const balanceOfStaker4 = await quantstampToken.balanceOf(staker4);
    const balanceOfStaker5 = await quantstampToken.balanceOf(staker5);
    // it should not transfer anything to stakers with no stakes in the pool
    await qspb.withdrawStake(orangePoolParams.index, {from : staker3});
    assert.equal(balanceOfQspb.toNumber(), (await qspb.balanceQspWei.call()));
    assert.equal(balanceOfStaker3.toNumber(), (await quantstampToken.balanceOf(staker3)).toNumber());
    // it should transfer back funds to stakers with stakes in the pool
    await qspb.withdrawStake(orangePoolParams.index, {from : staker1});
    await qspb.withdrawStake(orangePoolParams.index, {from : staker2});
    await qspb.withdrawStake(orangePoolParams.index, {from : staker4});
    await qspb.withdrawStake(orangePoolParams.index, {from : staker5});
    // it should not allow a different stakeholder to withdraw the deposit
    Util.assertTxFail(qspb.withdrawDeposit(orangePoolParams.index, {from : stakeholder2}));
    // the owner of the orange pool (stakeholder 1) can no longer deposit funds
    Util.assertTxFail(qspb.depositFunds(orangePoolParams.index, oneHundredQsp, {from : stakeholder1}));
    // the balance of the Assurance contract should be decreased
    balanceOfQspb = balanceOfQspb.minus(orangePoolParams.totalStakeQspWei).minus(orangePoolParams.depositQspWei);
    // the owner of the orange pool withdraws his/her funds
    await qspb.withdrawDeposit(orangePoolParams.index, {from : stakeholder1});
    // the balance of the stakers should be updated
    assert.equal(balanceOfStaker1.plus(staker1StakeOrangePool).toNumber(), (await quantstampToken.balanceOf(staker1)).toNumber());
    assert.equal(balanceOfStaker2.plus(staker2StakeOrangePool).toNumber(), (await quantstampToken.balanceOf(staker2)).toNumber());
    assert.equal(balanceOfStaker4.plus(staker4StakeOrangePool).toNumber(), (await quantstampToken.balanceOf(staker4)).toNumber());
    assert.equal(balanceOfStaker5.plus(staker5StakeOrangePool).toNumber(), (await quantstampToken.balanceOf(staker5)).toNumber());
    // the stakes, pool size and deposit of the orange pool are update
    orangePoolParams.totalStakeQspWei = new BigNumber(0);
    orangePoolParams.poolSizeQspWei = new BigNumber(0);
    orangePoolParams.depositQspWei = new BigNumber(0);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, orangePoolParams, balanceOfQspb);
  });

  it("should award a payout to staker3 from the gray pool after the first pay period", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(grayPoolParams.index), PoolState.NotViolatedFunded);
    // check if the first pay period of the gray pool has passed
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // fast-forward to block where the first pay period for the gray pool starts
    const blocksUntilFirstPayout = grayPoolParams.timeOfStateInBlocks.plus(grayPoolParams.payPeriodInBlocks).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilFirstPayout);
    const payoutStaker3 = staker3PayoutGrayPool.times(grayPoolParams.maxPayoutQspWei).dividedToIntegerBy(grayPoolParams.poolSizeQspWei);
    const balanceOfStaker3 = await quantstampToken.balanceOf(staker3);
    // check that the actual payout is equal to the expected payout
    assert.equal(payoutStaker3.toNumber(), (await qspb.computePayout(grayPoolParams.index, staker3)).toNumber());
    // staker3 receives payout
    await qspb.withdrawInterest(grayPoolParams.index, {from : staker3});
    // the balance of staker 3 should have increased
    assert.equal(balanceOfStaker3.plus(payoutStaker3).toNumber(), (await quantstampToken.balanceOf(staker3)).toNumber());
    // the deposit of the gray pool needs to be updated
    grayPoolParams.depositQspWei = grayPoolParams.depositQspWei.minus(payoutStaker3);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the gray pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker3);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should deposit funds from stakeholder2 in the gray pool", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(grayPoolParams.index), PoolState.NotViolatedFunded);
    await qspb.depositFunds(grayPoolParams.index, newDepostStakeholder2GrayPool, {from : stakeholder2});
    // the deposit of the gray pool needs to be updated
    grayPoolParams.depositQspWei = grayPoolParams.depositQspWei.plus(newDepostStakeholder2GrayPool);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the gray pool
    balanceOfQspb = balanceOfQspb.plus(newDepostStakeholder2GrayPool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should place a stake for expert staker5, which should set the first expert staker in the gray pool", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(grayPoolParams.index), PoolState.NotViolatedFunded);
    // staker5 places a stake in the Gray Pool
    await qspb.stakeFunds(grayPoolParams.index, staker5StakeGrayPool, {from : staker5});
    staker5StakeBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // since staker1 is a security expert on the TCR, the pool should update its firstExpertStaker field
    grayPoolParams.firstExpertStaker = staker5;
    // the total QSP staked should also increase, as well as the pool size and stake count
    grayPoolParams.totalStakeQspWei = grayPoolParams.totalStakeQspWei.plus(staker5StakeGrayPool);
    staker5PayoutGrayPool = staker5StakeGrayPool.times(grayPoolParams.bonusExpertFactor.pow(2).plus(new BigNumber(100).pow(2))).
      times(grayPoolParams.bonusFirstExpertFactor.plus(100)).dividedBy(new BigNumber(100).pow(3));
    grayPoolParams.poolSizeQspWei = grayPoolParams.poolSizeQspWei.plus(staker5PayoutGrayPool);
    grayPoolParams.stakeCount = grayPoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the gray pool
    balanceOfQspb = balanceOfQspb.plus(staker5StakeGrayPool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should create the White Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the white pool
    whitePoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : whitePoolParams.owner});
    whitePoolParams.contractPolicy = await OwnerNotChangedPolicy.new(whitePoolParams.owner);
    // create pool
    await instantiatePool(qspb, whitePoolParams);
    // update the time when the status of the pool changed
    whitePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 3);
    whitePoolParams.index = 2;
    // the balance of the Assurance contract should be increased by the amount deposited in the white pool
    balanceOfQspb = balanceOfQspb.plus(whitePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, whitePoolParams, balanceOfQspb);
  });

  it("should allow staker1 to stake in white pool", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(whitePoolParams.index), PoolState.Initialized);
    // staker1 places a stake in the White Pool
    await qspb.stakeFunds(whitePoolParams.index, staker1StakeWhitePool, {from : staker1});
    // since staker1 is a security expert on the TCR, the pool should update its firstExpertStaker field
    whitePoolParams.firstExpertStaker = staker1;
    // the total QSP staked should also increase, as well as the pool size and stake count
    whitePoolParams.totalStakeQspWei = whitePoolParams.totalStakeQspWei.plus(staker1StakeWhitePool);
    const staker1PayoutWhitePool = staker1StakeWhitePool.times(whitePoolParams.bonusExpertFactor.plus(100)).
      times(whitePoolParams.bonusFirstExpertFactor.plus(100)).dividedBy(new BigNumber(100).pow(2));
    whitePoolParams.poolSizeQspWei = whitePoolParams.poolSizeQspWei.plus(staker1PayoutWhitePool);
    whitePoolParams.stakeCount = whitePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the white pool
    balanceOfQspb = balanceOfQspb.plus(staker1StakeWhitePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, whitePoolParams, balanceOfQspb);
  });

  it("should create the Purple Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the purple pool
    purplePoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : purplePoolParams.owner});
    purplePoolParams.contractPolicy = await OwnerNotChangedPolicy.new(purplePoolParams.owner);
    // award budget to stakeholder 3 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(purplePoolParams.owner, stakeholder3Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder3Budget, {from : purplePoolParams.owner});
    // create pool
    await instantiatePool(qspb, purplePoolParams);
    // update the time when the status of the pool changed
    purplePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 4);
    purplePoolParams.index = 3;
    // the balance of the Assurance contract should be increased by the amount deposited in the purple pool
    balanceOfQspb = balanceOfQspb.plus(purplePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, purplePoolParams, balanceOfQspb);
  });

  it("should not allow staker5 to place a stake in the white pool after the timeout of the pool was reached", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(whitePoolParams.index), PoolState.Initialized);
    // check if the timeout of the white pool was reached
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // fast-forward to block where the timeout occurs
    const blocksUntilTimeout = whitePoolParams.timeOfStateInBlocks.plus(whitePoolParams.timeoutInBlocks).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilTimeout);
    // staker5 wants to place a stake in the White Pool but he cannot, because the pool has expired
    await qspb.stakeFunds(whitePoolParams.index, staker5StakeWhitePool, {from : staker5});
    // the balance should not have changed
    assert.equal(balanceOfQspb.toNumber(), (await qspb.balanceQspWei.call()));
    // the state of the white pool should have changed to cancelled
    whitePoolParams.state = PoolState.Cancelled;
    whitePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // staker1 should be allowed to withdraw his stake
    await qspb.withdrawStake(whitePoolParams.index, {from : staker1});
    // the total QSP staked should also decrease, as well as the pool size
    whitePoolParams.totalStakeQspWei = new BigNumber(0);
    whitePoolParams.poolSizeQspWei =  new BigNumber(0);
    // the balance of the Assurance contract should be increased by the amount staked in the white pool
    balanceOfQspb = balanceOfQspb.minus(staker1StakeWhitePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, whitePoolParams, balanceOfQspb);
  });

  it("should place stakes for stakers 2 and 4 in the purple pool, after which the pool should transition in to NotViolatedUnderfunded", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(purplePoolParams.index), PoolState.Initialized);
    // staker 2 stakes funds
    await qspb.stakeFunds(purplePoolParams.index, staker2StakePurplePool, {from : staker2});
    // since staker2 is a security expert on the TCR, the pool should update its firstExpertStaker field
    purplePoolParams.firstExpertStaker = staker2;
    // the total QSP staked should also increase, as well as the pool size and stake count
    purplePoolParams.totalStakeQspWei = purplePoolParams.totalStakeQspWei.plus(staker2StakePurplePool);
    const staker2PayoutPurplePool = staker2StakePurplePool.times(purplePoolParams.bonusExpertFactor.plus(100)).
      times(purplePoolParams.bonusFirstExpertFactor.plus(100)).dividedBy(new BigNumber(100).pow(2));
    purplePoolParams.poolSizeQspWei = purplePoolParams.poolSizeQspWei.plus(staker2PayoutPurplePool);
    purplePoolParams.stakeCount = purplePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the pool
    balanceOfQspb = balanceOfQspb.plus(staker2StakePurplePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, purplePoolParams, balanceOfQspb);
    // staker 4 stakes funds
    await qspb.stakeFunds(purplePoolParams.index, staker4StakePurplePool, {from : staker4});
    // the state of the purple pool should have changed to not violated underfunded
    purplePoolParams.state = PoolState.NotViolatedUnderfunded;
    purplePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // the total QSP staked should also increase, as well as the pool size and stake count
    purplePoolParams.totalStakeQspWei = purplePoolParams.totalStakeQspWei.plus(staker4StakePurplePool);
    purplePoolParams.poolSizeQspWei = purplePoolParams.poolSizeQspWei.plus(staker4StakePurplePool);
    purplePoolParams.stakeCount = purplePoolParams.stakeCount.plus(1);
    // the balance of the Assurance contract should be increased by the amount staked in the pool
    balanceOfQspb = balanceOfQspb.plus(staker4StakePurplePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, purplePoolParams, balanceOfQspb);
  });

  it("should not award staker5 a payout from the gray pool before the payout period has passed", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(grayPoolParams.index), PoolState.NotViolatedFunded);
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // staker 5 should not receive a payout before the pay period has passed
    assert.isTrue(staker5StakeBlock.plus(grayPoolParams.payPeriodInBlocks) > currentBlock);
    await qspb.withdrawInterest(grayPoolParams.index, {from : staker5});
    assert.equal(balanceOfQspb.toNumber(), (await qspb.balanceQspWei.call()));
    // check that the 1st pay period has not passed for staker5
    // fast-forward to block where the pay period ends
    const blocksUntilPayout = staker5StakeBlock.plus(grayPoolParams.payPeriodInBlocks).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilPayout);
    // compute payout for staker5
    const payoutStaker5 = staker5PayoutGrayPool.times(grayPoolParams.maxPayoutQspWei).dividedToIntegerBy(grayPoolParams.poolSizeQspWei);
    assert.equal(payoutStaker5.toNumber(), (await qspb.computePayout(grayPoolParams.index, staker5)).toNumber());
    // staker5 wants to withdraw his 2 payouts and receives them
    await qspb.withdrawInterest(grayPoolParams.index, {from : staker5});
    // the deposit of the orange pool needs to be updated
    grayPoolParams.depositQspWei = grayPoolParams.depositQspWei.minus(payoutStaker5);
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker5);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should create the Blue Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the blue pool
    bluePoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : bluePoolParams.owner});
    bluePoolParams.contractPolicy = await OwnerNotChangedPolicy.new(bluePoolParams.owner);
    // create pool
    await instantiatePool(qspb, bluePoolParams);
    // update the time when the status of the pool changed
    bluePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 5);
    bluePoolParams.index = 4;
    // the balance of the Assurance contract should be increased by the amount deposited in the blue pool
    balanceOfQspb = balanceOfQspb.plus(bluePoolParams.depositQspWei);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, bluePoolParams, balanceOfQspb);
  });

  it("should deposit funds in the purple pool and transition into NotViolatedFunded", async function() {
    // check that the pool is in the NotViolatedUnderfunded state
    assert.equal(await qspb.getPoolState(purplePoolParams.index), PoolState.NotViolatedUnderfunded);
    // deposit funds
    const amountDeposited = new BigNumber(Util.toQsp(5000));
    await qspb.depositFunds(purplePoolParams.index, amountDeposited, {from : stakeholder3});
    // the state and deposit of the purple pool should have changed to not violated underfunded
    purplePoolParams.state = PoolState.NotViolatedFunded;
    purplePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    purplePoolParams.depositQspWei = purplePoolParams.depositQspWei.plus(amountDeposited);
    // the balance of the Assurance contract should be increased by the amount staked in the white pool
    balanceOfQspb = balanceOfQspb.plus(amountDeposited);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, purplePoolParams, balanceOfQspb);
  });

  it("should place a stake for staker1 in the blue pool, which should transition the pool into the NotViolatedUnderfunded state", async function() {
    // check that the pool is in the Initialized state
    assert.equal(await qspb.getPoolState(bluePoolParams.index), PoolState.Initialized);
    // staker1 places a stake in the Blue Pool
    await qspb.stakeFunds(bluePoolParams.index, staker1StakeBluePool, {from : staker1});
    // since staker1 is a security expert on the TCR, the pool should update its firstExpertStaker field
    bluePoolParams.firstExpertStaker = staker1;
    // the total QSP staked should also increase, as well as the pool size and stake count
    bluePoolParams.totalStakeQspWei = bluePoolParams.totalStakeQspWei.plus(staker1StakeBluePool);
    const staker1PayoutBluePool = staker1StakeBluePool.times(bluePoolParams.bonusExpertFactor.plus(100)).
      times(bluePoolParams.bonusFirstExpertFactor.plus(100)).dividedBy(new BigNumber(100).pow(2));
    bluePoolParams.poolSizeQspWei = bluePoolParams.poolSizeQspWei.plus(staker1PayoutBluePool);
    bluePoolParams.stakeCount = bluePoolParams.stakeCount.plus(1);
    // the state of the blue pool should have changed to not violated underfunded
    bluePoolParams.state = PoolState.NotViolatedUnderfunded;
    bluePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // the balance of the Assurance contract should be increased by the amount staked in the blue pool
    balanceOfQspb = balanceOfQspb.plus(staker1StakeBluePool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, bluePoolParams, balanceOfQspb);
  });

  it("should not allow stakeholder2 to withdraw a claim from the blue pool, because it is not violated", async function() {
    // check that the pool is in the NotViolatedUnderfunded state
    assert.equal(await qspb.getPoolState(bluePoolParams.index), PoolState.NotViolatedUnderfunded);
    // try to withdraw claim
    Util.assertTxFail(qspb.withdrawClaim(bluePoolParams.index, {from : stakeholder2}));
    // check that all pool properties are the same as before
    await assertEntirePoolState(qspb, bluePoolParams, balanceOfQspb);
  });

  it("should not allow stakers to withdraw stakes from a violated pool. Only the pool owner should be able to withdraw the claim", async function() {
    // check that the pool is in the NotViolatedFunded state
    assert.equal(await qspb.getPoolState(purplePoolParams.index), PoolState.NotViolatedFunded);
    // violate the policy of the purple pool
    await purplePoolParams.candidateContract.transferOwnership(orangePoolParams.owner, {from : stakeholder3});
    assert.isTrue(await purplePoolParams.contractPolicy.isViolated(purplePoolParams.candidateContract.address));
    // should not allow stakeholder2 who is not the owner of this pool to withdraw the claim
    Util.assertTxFail(qspb.withdrawClaim(purplePoolParams.index, {from : stakeholder2}));
    // should not allow staker4 to withdraw their stake after the policy is violated
    Util.assertTxFail(qspb.withdrawStake(purplePoolParams.index, {from : staker4}));
    // should allow stakeholder3 who is the owner of the pool to withdraw the claim
    await qspb.withdrawClaim(purplePoolParams.index, {from : stakeholder3});
    // the balance of the Assurance contract should be reduced
    balanceOfQspb = balanceOfQspb.minus(purplePoolParams.depositQspWei).minus(purplePoolParams.totalStakeQspWei);
    // the pool should be set in the violatedFunded state and the deposit and stakes should be set to 0
    purplePoolParams.state = PoolState.ViolatedFunded;
    purplePoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    purplePoolParams.depositQspWei = new BigNumber(0);
    purplePoolParams.totalStakeQspWei = new BigNumber(0);
    purplePoolParams.poolSizeQspWei = new BigNumber(0);
    // check that all pool properties are the same as before
    await assertEntirePoolState(qspb, purplePoolParams, balanceOfQspb);
  });

  it("should award a payout to staker5 and then transition into the PolicyExpired state", async function() {
    const currentBlock = new BigNumber((await web3.eth.getBlock("latest")).number);
    // fast-forward to when policy expires
    const blocksUntilPolicyExpires = grayPoolParams.timeOfStateInBlocks.plus(grayPoolParams.minStakeTimeInBlocks).minus(currentBlock);
    await Util.mineNBlocks(blocksUntilPolicyExpires);
    // compute payout for staker5
    const payoutStaker5 = staker5PayoutGrayPool.times(grayPoolParams.maxPayoutQspWei).dividedToIntegerBy(grayPoolParams.poolSizeQspWei);
    assert.equal(payoutStaker5.toNumber(), (await qspb.computePayout(grayPoolParams.index, staker5)).toNumber());
    // staker 5 gets payout
    await qspb.withdrawInterest(grayPoolParams.index, {from : staker5});
    grayPoolParams.state = PoolState.PolicyExpired;
    grayPoolParams.depositQspWei = grayPoolParams.depositQspWei.minus(payoutStaker5);
    // the balance of the assrunce contract should be reduced
    balanceOfQspb = balanceOfQspb.minus(payoutStaker5);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should award staker3 three payouts and then the stake in the pool", async function() {
    // compute payout for staker3
    const payoutStaker3 = staker3PayoutGrayPool.times(grayPoolParams.maxPayoutQspWei).times(3).dividedToIntegerBy(grayPoolParams.poolSizeQspWei);
    assert.equal(payoutStaker3.toNumber(), (await qspb.computePayout(grayPoolParams.index, staker3)).toNumber());
    // staker 3 gets 3 x payout
    await qspb.withdrawInterest(grayPoolParams.index, {from : staker3});
    grayPoolParams.depositQspWei = grayPoolParams.depositQspWei.minus(payoutStaker3);
    // the balance of the assrunce contract should be reduced
    balanceOfQspb = balanceOfQspb.minus(payoutStaker3);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should allow stakers 3 and 5 to withdraw their stakes", async function() {
    await qspb.withdrawStake(grayPoolParams.index, {from: staker3});
    await qspb.withdrawStake(grayPoolParams.index, {from: staker5});
    grayPoolParams.totalStakeQspWei = grayPoolParams.totalStakeQspWei.minus(staker3StakeGrayPool).minus(staker5StakeGrayPool);
    grayPoolParams.poolSizeQspWei = grayPoolParams.poolSizeQspWei.minus(staker3PayoutGrayPool).minus(staker5PayoutGrayPool);
    // the balance of the assrunce contract should be reduced
    balanceOfQspb = balanceOfQspb.minus(staker3StakeGrayPool).minus(staker5StakeGrayPool);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });

  it("should allow the stakeholder to withdraw their deposit", async function() {
    await qspb.withdrawDeposit(grayPoolParams.index, {from: grayPoolParams.owner});
    balanceOfQspb = balanceOfQspb.minus(grayPoolParams.depositQspWei);
    // the pool deposit and state should change
    grayPoolParams.depositQspWei = new BigNumber(0);
    grayPoolParams.state = PoolState.Cancelled;
    grayPoolParams.timeOfStateInBlocks = new BigNumber((await web3.eth.getBlock("latest")).number);
    // check that all pool properties are as expected
    await assertEntirePoolState(qspb, grayPoolParams, balanceOfQspb);
  });
});
