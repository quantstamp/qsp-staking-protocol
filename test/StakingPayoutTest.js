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
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker2), 0);     
    });

    it("should return 0 if the payPeriodInBlocks has not passed yet", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);     
    });

    it("should return maxPayoutQspWei if the payPeriodInBlocks has passed and there is one staker", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      Util.mineNBlocks(payPeriodInBlocks);
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), maxPayoutQspWei);     
    });

    it("should return maxPayoutQspWei/2 if there are two non-expert stakers with the same amount at stake", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      Util.mineNBlocks(payPeriodInBlocks);
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker3), maxPayoutQspWei/2);     
    });    

    it("should give a higher payout to the security expert than to a non-expert and even more to the first expert", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      Util.mineNBlocks(payPeriodInBlocks);
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      var payout1 = await qspb.computePayout(currentPoolIndex, staker1);
      var payout2 = await qspb.computePayout(currentPoolIndex, staker2);
      var payout3 = await qspb.computePayout(currentPoolIndex, staker3);
      var payout4 = await qspb.computePayout(currentPoolIndex, staker4);
      // first expert should have a higher payout than the 2nd expert
      assert(payout1 > payout2, "The payout of the first expert is not higher than the 2nd expert,");
      // 2nd expert should have a higher payout than non-experts
      assert(payout2 > payout3, "The payout of the second expert is not higher than non-experts.");
      // non-experts should have the same payout
      assert.equal(parseInt(payout3), payout4, "The payout of non-experts is not equal.");
      // the sum of all payouts should be equal to maxPayoutQspWei
      assert.equal(parseInt(payout1) + parseInt(payout2) + parseInt(payout3) + parseInt(payout4), maxPayoutQspWei,
        "The sum of payouts of all stakers is not equal to maxPayoutQspWei.");
    }); 
  });
});
