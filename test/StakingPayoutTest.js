const QuantstampStaking = artifacts.require('QuantstampStaking');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const TCRUtil = require('./tcrutils.js');
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
  const maxPayoutQspWei = Util.toQsp(10);
  const minStakeQspWei = Util.toQsp(10);
  const bonusExpertFactor = 3;
  const bonusFirstExpertFactor = 5;
  const payPeriodInBlocks = 5;
  const minStakeTimeInBlocks = 10;
  const timeoutInBlocks = 5;
  const urlOfAuditReport = "URL";
  const initialDepositQspWei = maxPayoutQspWei;

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
      assert.equal(payout3.toNumber(), payout4, "The payout of non-experts is not equal.");
      // all payouts must be positive
      assert(payout4 > 0, "All payouts must be positive values.");
      // the sum of all payouts should be equal to maxPayoutQspWei
      assert.equal(payout1.toNumber() + payout2.toNumber() + payout3.toNumber() + payout4.toNumber(), maxPayoutQspWei,
        "The sum of payouts of all stakers is not equal to maxPayoutQspWei.");
    });

    it("should return 0 if all the stakes have been withdawn", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      Util.mineNBlocks(minStakeTimeInBlocks);
      await qspb.withdrawStake(currentPoolIndex, {from: staker1});
      await qspb.withdrawStake(currentPoolIndex, {from: staker2});
      await qspb.withdrawStake(currentPoolIndex, {from: staker3});
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });
  });

  describe("withdrawInterest", async function() {
    it("should reject requests made before the pool has switched into the NotViolatedFunded state", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei/2, {from: staker1});
      Util.mineNBlocks(payPeriodInBlocks);
      // even though the necessary amount of blocks have passed, it should still reject the request
      Util.assertTxFail(qspb.withdrawInterest(currentPoolIndex, staker1));
    });

    it("should reject requests made before the necessary amount of blocks have passed", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);      
      Util.mineNBlocks(payPeriodInBlocks-1);
      // even though pool is in the correct state NotViolatedFunded, it should still reject the request
      Util.assertTxFail(qspb.withdrawInterest(currentPoolIndex, staker1));
    });

    it("should reject requests only for stakers that have not placed their stake for the required amount of time", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      Util.mineOneBlock();
      Util.mineOneBlock();
      Util.mineOneBlock();
      // staker4 places the stake after the pool transitions to the NotViolatedFunded state
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      Util.mineNBlocks(payPeriodInBlocks-3);
      // at this point staker3 can get a payout, but staker4 cannot
      var balanceOfStaker4 = await Util.balanceOf(quantstampToken, staker4);
      var payoutStaker = await qspb.computePayout(currentPoolIndex, staker3);
      // the request of staker3 must succeed
      await qspb.withdrawInterest(currentPoolIndex, staker3, {from: staker3});
      // the request of staker4 must fail
      Util.assertTxFail(qspb.withdrawInterest(currentPoolIndex, staker4, {from: staker4}));
      assert.equal(await Util.balanceOf(quantstampToken, staker4), balanceOfStaker4);
      // after waiting 3 more blocks the request of staker 4 must succeed
      Util.mineOneBlock();
      Util.mineOneBlock();
      Util.mineOneBlock();
      await qspb.withdrawInterest(currentPoolIndex, staker4, {from: staker4});
      assert.equal(await Util.balanceOf(quantstampToken, staker4), parseInt(balanceOfStaker4) + parseInt(payoutStaker));
    });

    it("should move the pool in a cancelled state if a staker cannot be payed out", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      Util.mineNBlocks(payPeriodInBlocks);
      await qspb.withdrawInterest(currentPoolIndex, staker3, {from: staker3});
      var balanceOfStaker3 = await Util.balanceOf(quantstampToken, staker3);
      Util.mineNBlocks(payPeriodInBlocks);
      await qspb.withdrawInterest(currentPoolIndex, staker3, {from: staker3});
      // the balance of staker3 must be the same as before the 2nd call to withdrawInterest
      assert.equal(await Util.balanceOf(quantstampToken, staker3), balanceOfStaker3);
      // the pool must be now moved into the Cancelled state
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Cancelled);
    });

    it("should only payout those stakes of the same staker which have been placed for a sufficient amount of time", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      Util.mineOneBlock();
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      Util.mineOneBlock();
      // the 2nd stake made by staker3
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei/2, {from: staker3});
      Util.mineOneBlock();
      Util.mineOneBlock();
      // at this point staker3 can get a payout only for his first stake
      var balanceOfStaker3 = await Util.balanceOf(quantstampToken, staker3); 
      var payoutStakerOneStake = await qspb.computePayout(currentPoolIndex, staker3);
      await qspb.withdrawInterest(currentPoolIndex, staker3, {from: staker3});
      // after waiting a full payPeriod, staker3 must receive a higher payout for both stakes 
      Util.mineNBlocks(payPeriodInBlocks);
      var payoutStakerTwoStakes = await qspb.computePayout(currentPoolIndex, staker3);
      assert(payoutStakerTwoStakes > payoutStakerOneStake, "Payout is not higher for 2 stakes than 1");
      await qspb.withdrawInterest(currentPoolIndex, staker3, {from: staker3});
      assert.equal(await Util.balanceOf(quantstampToken, staker3), parseInt(balanceOfStaker3) + parseInt(payoutStakerOneStake) + parseInt(payoutStakerTwoStakes));
    });
  });
});
