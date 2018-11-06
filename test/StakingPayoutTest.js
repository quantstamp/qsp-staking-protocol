const QuantstampStaking = artifacts.require('QuantstampStaking');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const TCRUtil = require('./tcrutils.js');
const { ZERO_ADDRESS } = require('./constants.js');
const Util = require("./util.js");

contract('QuantstampStaking: staker requests payout', function(accounts) {
  const owner = accounts[0];
  const poolOwner = accounts[1];
  const staker1 = accounts[2]; // expert staker
  const staker2 = accounts[3]; // expert staker
  const staker3 = accounts[4]; // non-expert staker
  const staker4 = accounts[5]; // non-expert staker
  const poolOwnerBudget = Util.toQsp(100000);
  const minDeposit = TCRUtil.minDep;
  const stakerBudget = Util.toQsp(100);
  const candidateContractBalance = Util.toEther(100);
  const PoolState = Object.freeze({
    None : 0,
    Initialized : 1,
    NotViolatedUnderfunded : 2,
    ViolatedUnderfunded : 3,
    NotViolatedFunded : 4,
    ViolatedFunded : 5,
    Cancelled: 6
  });
  
  // vars needed for creating pool
  const maxPayoutQspWei = Util.toQsp(100);
  const minStakeQspWei = Util.toQsp(10);
  const bonusExpertFactor = 3;
  const bonusFirstExpertFactor = 5;
  const payPeriodInBlocks = 5;
  const minStakeTimeInBlocks = 10;
  const timeoutInBlocks = 5;
  const urlOfAuditReport = "URL";
  const initialDepositQspWei = poolOwnerBudget;

  let qspb;
  let quantstampToken;
  let candidateContract;
  let contractPolicy;
  let quantstampRegistry;
  let quantstampParameterizer;
  let voting;
  let currentPoolNumber;
  let currentPoolIndex;
  
  beforeEach(async function() {
    quantstampToken = await QuantstampToken.new(owner.address, {from: owner});
    voting = await Voting.new(quantstampToken.address);
    quantstampParameterizer = await QuantstampParameterizer.new();
    await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
    quantstampRegistry = await QuantstampStakingRegistry.new();
    await quantstampRegistry.init(quantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');
    candidateContract = await CandidateContract.new(candidateContractBalance);
    contractPolicy = await ZeroBalancePolicy.new();
    qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
    // quick check that balance is zero
    assert.equal(await qspb.balanceQspWei.call(), 0);
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
    await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
    // expert stakers
    await quantstampToken.transfer(staker1, parseInt(stakerBudget) + 2 * Util.toQsp(minDeposit), {from : owner});
    await quantstampToken.approve(qspb.address, stakerBudget, {from : staker1});
    await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : staker1});
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : staker1});
    await quantstampToken.transfer(staker2, parseInt(stakerBudget) + 2 * Util.toQsp(minDeposit), {from : owner});
    await quantstampToken.approve(qspb.address, stakerBudget, {from : staker2});
    await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : staker2});
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : staker2});
    // non-expert stakers
    await quantstampToken.transfer(staker3, stakerBudget, {from : owner});
    await quantstampToken.approve(qspb.address, stakerBudget, {from : staker3});
    await quantstampToken.transfer(staker4, stakerBudget, {from : owner});
    await quantstampToken.approve(qspb.address, stakerBudget, {from : staker4});
    // add experts to TCR
    await TCRUtil.addToWhitelist(staker1, minDeposit, staker1, quantstampRegistry);
    await TCRUtil.addToWhitelist(staker2, minDeposit, staker2, quantstampRegistry);
    // create pool
    await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
      initialDepositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
      minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});

    currentPoolNumber = await qspb.getPoolsLength();
    currentPoolIndex = currentPoolNumber - 1;
  });

  describe("computePayout", async function() {

    it("should return 0 if there is no stake in this pool", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });

    it("should return 0 if there is no stake made by the staker in this pool", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      assert.equal(await qspb.computePayout(currentPoolIndex, staker2), 0);     
    });

    it("should return 0 if the minStakeTimeInBlocks has not passed yet", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);     
    });

    it("should return maxPayoutQspWei if the minStakeTimeInBlocks has passed and there is one staker", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      Util.mineNBlocks(minStakeTimeInBlocks);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), maxPayoutQspWei);     
    });

    it("should return maxPayoutQspWei/2 if there are two non-expert stakers", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      Util.mineNBlocks(minStakeTimeInBlocks);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), maxPayoutQspWei/2);     
    });    

    it("should fail if the policy is not violated either according to state or policy", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });

    
    it("should return false if the expert is not on the list", async function() {
      assert.strictEqual(await qspb.isExpert(staker1),true,'Applicant was not set as expert');
      assert.strictEqual(await qspb.isExpert(ZERO_ADDRESS),false,'Zero address was apparently an expert');
    });
  });
});
