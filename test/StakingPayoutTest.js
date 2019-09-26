/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const RegistryWrapper = artifacts.require('TokenCuratedRegistry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const TCRUtil = require('./tcrutils.js');
const Util = require("./util.js");
const BigNumber = require('bignumber.js');

contract('QuantstampStaking: staker requests payout', function(accounts) {
  const owner = accounts[0];
  const poolOwner = accounts[1];
  const staker1 = accounts[2]; // expert staker
  const staker2 = accounts[3]; // expert staker
  const staker3 = accounts[4]; // non-expert staker
  const staker4 = accounts[5]; // non-expert staker
  const qspAdmin = accounts[6]; // non-expert staker
  const poolOwnerBudget = Util.toQsp(100000);
  const minDeposit = TCRUtil.minDep;
  const stakerBudget = new BigNumber(Util.toQsp(100));
  const candidateContractBalance = Util.toEther(100);
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

  // vars needed for creating pool
  const maxPayoutQspWei = new BigNumber(Util.toQsp(10));
  const minStakeQspWei = new BigNumber(Util.toQsp(10));
  const bonusExpertFactor = 3;
  const bonusFirstExpertFactor = 5;
  const payPeriodInBlocks = 8;
  const minStakeTimeInBlocks = 30;
  const timeoutInBlocks = 5;
  const urlOfAuditReport = "URL";
  const initialDepositQspWei = maxPayoutQspWei;
  const poolName = "myPool";
  const defaultMaxTotalStake = new BigNumber(Util.toQsp(10000));

  let qspb;
  let quantstampStakingData;
  let quantstampToken;
  let candidateContract;
  let contractPolicy;
  let quantstampRegistry;
  let wrapper;
  let quantstampParameterizer;
  let voting;
  let currentPoolNumber;
  let currentPoolIndex;

  beforeEach(async function() {
    quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
    voting = await Voting.new(quantstampToken.address);
    quantstampParameterizer = await QuantstampParameterizer.new();
    await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
    quantstampRegistry = await QuantstampStakingRegistry.new();
    await quantstampRegistry.init(quantstampToken.address, voting.address, quantstampParameterizer.address, 'QSPtest');
    wrapper = await RegistryWrapper.new(quantstampRegistry.address);
    candidateContract = await CandidateContract.new(candidateContractBalance);
    contractPolicy = await ZeroBalancePolicy.new();

    quantstampStakingData = await QuantstampStakingData.new(quantstampToken.address);
    qspb = await QuantstampStaking.new(quantstampToken.address, wrapper.address,
      quantstampStakingData.address, {from: owner});
    await quantstampStakingData.setWhitelistAddress(qspb.address);

    // quick check that balance is zero
    assert.equal(await qspb.getBalanceQspWei(), 0);
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
    await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
    // expert stakers
    await quantstampToken.transfer(staker1, stakerBudget.plus(new BigNumber(Util.toQsp(minDeposit)).plus(2)), {from : owner});
    await quantstampToken.approve(qspb.address, stakerBudget, {from : staker1});
    await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : staker1});
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : staker1});
    await quantstampToken.transfer(staker2, stakerBudget.plus(new BigNumber(Util.toQsp(minDeposit)).plus(2)), {from : owner});
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
      minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, defaultMaxTotalStake, {from: poolOwner});

    currentPoolNumber = await quantstampStakingData.getPoolsLength();
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
      await Util.mineNBlocks(payPeriodInBlocks);
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(maxPayoutQspWei.toNumber(), (await qspb.computePayout(currentPoolIndex, staker1)).toNumber());
    });

    it("should return maxPayoutQspWei/2 if there are two non-expert stakers with the same amount at stake", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      await Util.mineNBlocks(payPeriodInBlocks);
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(maxPayoutQspWei.dividedBy(2).toNumber(), (await qspb.computePayout(currentPoolIndex, staker3)).toNumber());
    });

    it("should give a higher payout to the security expert than to a non-expert and even more to the first expert", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      await Util.mineNBlocks(payPeriodInBlocks);
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      var payout1 = await qspb.computePayout(currentPoolIndex, staker1);
      var payout2 = await qspb.computePayout(currentPoolIndex, staker2);
      var payout3 = await qspb.computePayout(currentPoolIndex, staker3);
      var payout4 = await qspb.computePayout(currentPoolIndex, staker4);
      // first expert should have a higher payout than the 2nd expert
      assert.isTrue(payout1.gt(payout2), "The payout of the first expert is not higher than the 2nd expert,");
      // 2nd expert should have a higher payout than non-experts
      assert.isTrue(payout2.gt(payout3), "The payout of the second expert is not higher than non-experts.");
      // non-experts should have the same payout
      assert.equal(payout4.toNumber(), payout3.toNumber(), "The payout of non-experts is not equal.");
      // all payouts must be positive
      assert.isTrue(payout4.gt(0), "All payouts must be positive values.");
      // the sum of all payouts should be approximately equal to maxPayoutQspWei, but not higher
      assert.isTrue(payout1.plus(payout2).plus(payout3).plus(payout4).lt(maxPayoutQspWei),
        "The sum of payouts of all stakers is greather than maxPayoutQspWei");
    });

    it("should return 0 if all the stakes have been withdawn", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await Util.mineNBlocks(minStakeTimeInBlocks);
      await qspb.withdrawStake(currentPoolIndex, {from: staker1});
      await qspb.withdrawStake(currentPoolIndex, {from: staker2});
      await qspb.withdrawStake(currentPoolIndex, {from: staker3});
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });

    it("should return 0 if all the stakes have been withdawn", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await Util.mineNBlocks(minStakeTimeInBlocks);
      await qspb.withdrawStake(currentPoolIndex, {from: staker1});
      await qspb.withdrawStake(currentPoolIndex, {from: staker2});
      await qspb.withdrawStake(currentPoolIndex, {from: staker3});
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });

    it("should return 0 if the policy was violated before the pool was funded", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.NotViolatedFunded);
      // set balance to zero to violate policy
      await candidateContract.withdraw(candidateContractBalance);
      await qspb.withdrawStake(currentPoolIndex, {from: staker1});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.ViolatedFunded);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });

    it("should return 0 if the policy was violated before the pool was underfunded", async function() {
      // deposit a bit more in the pool such that it doesn't get cancelled after the first payout
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei.dividedBy(2), {from: poolOwner});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei.dividedBy(2), {from: staker1});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.NotViolatedFunded);
      // make one payout
      await Util.mineNBlocks(payPeriodInBlocks);
      await qspb.withdrawInterest(currentPoolIndex, {from: staker1});
      await qspb.withdrawInterest(currentPoolIndex, {from: staker2});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.NotViolatedUnderfunded);
      // set balance to zero to violate policy
      await candidateContract.withdraw(candidateContractBalance);
      await qspb.withdrawStake(currentPoolIndex, {from: staker1});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.ViolatedUnderfunded);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });

    it("should return 0 if the pool was cancelled", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei.dividedBy(2), {from: staker1});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.Initialized);
      await qspb.withdrawDeposit(currentPoolIndex, {from: poolOwner});
      assert.equal((await qspb.getPoolState(currentPoolIndex)).toNumber(), PoolState.Cancelled);
      assert.equal(await qspb.computePayout(currentPoolIndex, staker1), 0);
    });
  });

  describe("withdrawInterest", async function() {
    it("should reject requests made before the pool has switched into the NotViolatedFunded state", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei/2, {from: staker1});
      await Util.mineNBlocks(payPeriodInBlocks);
      // even though the necessary amount of blocks have passed, it should still not give a payout
      await Util.assertTxFail(qspb.withdrawInterest(currentPoolIndex, {from: staker1}));
    });

    it("should reject requests made before the necessary amount of blocks have passed", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      await Util.mineNBlocks(payPeriodInBlocks/2);
      const balance = await qspb.getBalanceQspWei();
      // even though pool is in the correct state NotViolatedFunded, it should still not give a payout
      await qspb.withdrawInterest(currentPoolIndex, {from: staker1});
      assert.equal((await qspb.getBalanceQspWei()).toNumber(), balance.toNumber());
    });

    it("should reject requests only for stakers that have not placed their stake for the required amount of time", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await Util.mineNBlocks(payPeriodInBlocks/2);
      // staker4 places the stake after the pool transitions to the NotViolatedFunded state
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      await Util.mineNBlocks(payPeriodInBlocks/2);
      // at this point staker3 can get a payout, but staker4 cannot
      var balanceOfStaker4 = new BigNumber(await Util.balanceOf(quantstampToken, staker4));
      var payoutStaker = await qspb.computePayout(currentPoolIndex, staker3);
      // the request of staker3 must succeed
      await qspb.withdrawInterest(currentPoolIndex, {from: staker3});
      // the request of staker4 must return 0
      await qspb.withdrawInterest(currentPoolIndex, {from: staker4});
      assert.equal(await Util.balanceOf(quantstampToken, staker4), balanceOfStaker4,
        "The balance of staker 4 has changed.");
      // after waiting for an entire payPeriod the request of staker 4 must succeed
      await Util.mineNBlocks(payPeriodInBlocks/2);
      await qspb.withdrawInterest(currentPoolIndex, {from: staker4});
      assert.equal(await Util.balanceOf(quantstampToken, staker4), balanceOfStaker4.plus(payoutStaker),
        "The balance of staker 4 does not include the payout");
    });

    it("should move the pool in a cancelled state if a staker cannot be payed out", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      await Util.mineNBlocks(payPeriodInBlocks);
      await qspb.withdrawInterest(currentPoolIndex, {from: staker3});
      var balanceOfStaker3 = await Util.balanceOf(quantstampToken, staker3);
      await Util.mineNBlocks(payPeriodInBlocks);
      await qspb.withdrawInterest(currentPoolIndex, {from: staker3});
      // the balance of staker3 must be the same as before the 2nd call to withdrawInterest
      assert.equal(await Util.balanceOf(quantstampToken, staker3), balanceOfStaker3);
      // the pool must be now moved into the Cancelled state
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Cancelled);
    });

    it("should only payout those stakes of the same staker which have been placed for a sufficient amount of time", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei/2, {from: staker3});
      await Util.mineOneBlock();
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker4});
      await Util.mineOneBlock();
      // the 2nd stake made by staker3
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei/2, {from: staker3});
      await Util.mineNBlocks(payPeriodInBlocks-2);
      // at this point staker3 can get a payout only for his first stake
      var balanceOfStaker3 = new BigNumber(await Util.balanceOf(quantstampToken, staker3));
      var payoutStakerOneStake = await qspb.computePayout(currentPoolIndex, staker3);
      await qspb.withdrawInterest(currentPoolIndex, {from: staker3});
      // after waiting a full payPeriod, staker3 must receive a higher payout for both stakes
      await Util.mineNBlocks(payPeriodInBlocks);
      var payoutStakerTwoStakes = await qspb.computePayout(currentPoolIndex, staker3);
      assert(payoutStakerTwoStakes > payoutStakerOneStake, "Payout is not higher for 2 stakes than 1");
      await qspb.withdrawInterest(currentPoolIndex, {from: staker3});
      assert.equal(balanceOfStaker3.plus(payoutStakerOneStake).plus(payoutStakerTwoStakes).toNumber(),
        await Util.balanceOf(quantstampToken, staker3), "Staker balance not right");
    });

    it("should transition into the PolicyExpired state if the policy has expired", async function() {
      await qspb.stakeFunds(currentPoolIndex, maxPayoutQspWei, {from : staker1});
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei.times(10), {from : poolOwner});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      await Util.mineNBlocks(minStakeTimeInBlocks);
      await qspb.withdrawInterest(currentPoolIndex, {from: staker1});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.PolicyExpired);
    });

    it("should pay an expert who is kicked off the TCR the same as if they were still on the TCR", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker1}); // staker1 is an expert
      assert.strictEqual(await qspb.isExpert(staker1), true, 'Staker1 was not set as judge');
      // deposit payment funds and run out the duration of the pool
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei.times(10), {from : poolOwner});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      await Util.mineNBlocks(minStakeTimeInBlocks);
      var payoutStakerOneOnTCR = await qspb.computePayout(currentPoolIndex, staker1);
      // remove staker1 from the TCR
      await TCRUtil.removeFromWhitelist(staker1, staker1, quantstampRegistry);
      assert.strictEqual(await qspb.isExpert(staker1), false, 'Staker1 was set as judge');
      var payoutStakerOneOffTCR = await qspb.computePayout(currentPoolIndex, staker1);
      assert.isTrue(payoutStakerOneOnTCR.eq(payoutStakerOneOffTCR));
    });

    it("should pay an expert who is added to the TCR after staking the same as if they were not on the TCR", async function() {
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      assert.strictEqual(await qspb.isExpert(staker3), false, 'Staker3 was set as judge');
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3}); // staker3 is not an expert after the last test
      // deposit payment funds and run out the duration of the pool
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei.times(10), {from : poolOwner});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      await Util.mineNBlocks(minStakeTimeInBlocks);
      var payoutStakerThreeOffTCR = await qspb.computePayout(currentPoolIndex, staker3);
      // add staker3 to the TCR
      await quantstampToken.transfer(staker3, stakerBudget.plus(new BigNumber(Util.toQsp(minDeposit)).plus(2)), {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker3});
      await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : staker3});
      await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : staker3});
      await TCRUtil.addToWhitelist(staker3, minDeposit, staker3, quantstampRegistry);
      assert.strictEqual(await qspb.isExpert(staker3), true, 'Staker3 was not set as judge');
      var payoutStakerThreeOnTCR = await qspb.computePayout(currentPoolIndex, staker3);
      assert.isTrue(payoutStakerThreeOnTCR.eq(payoutStakerThreeOffTCR));
    });
  });
});
