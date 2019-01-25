const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const RegistryWrapper = artifacts.require('TokenCuratedRegistry');
const Util = require("./util.js");
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const BigNumber = require('bignumber.js');

contract('QuantstampStaking: stakeholder deposits and withdrawals', function(accounts) {
  const owner = accounts[0];
  const qspAdmin = accounts[1];
  const poolOwner = accounts[3];
  const adversary = accounts[4];
  const staker = accounts[5];
  const poolOwnerBudget = Util.toQsp(100);
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

  let qspb;
  let quantstampToken;
  let candidateContract;
  let contractPolicy;
  let quantstampRegistry;
  let wrapper;
  const initialDepositQspWei = poolOwnerBudget;
  const minStakeQspWei = Util.toQsp(10);
  const maxPayableQspWei = Util.toQsp(200);
  const bonusExpertFactor = 3;
  const bonusFirstExpertFactor = 5;
  const payPeriodInBlocks = 15;
  const minStakeTimeInBlocks = new BigNumber(20);
  const timeoutInBlocks = 100;
  const urlOfAuditReport = "URL";
  const poolName = "myPool";
  const defaultMaxTotalStake = new BigNumber(Util.toQsp(10000));

  beforeEach(async function() {
    quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
    quantstampRegistry = await QuantstampStakingRegistry.new();
    wrapper = await RegistryWrapper.new(quantstampRegistry.address);
    candidateContract = await CandidateContract.new(candidateContractBalance);
    contractPolicy = await ZeroBalancePolicy.new();

    qspb = await QuantstampStaking.new(quantstampToken.address, wrapper.address, {from: owner});
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
    await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});

    await quantstampToken.transfer(staker, minStakeQspWei, {from : owner});
    await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});

    assert.equal(await qspb.balanceQspWei.call(), 0);

    // create pool
    await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayableQspWei, minStakeQspWei,
      initialDepositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
      minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, defaultMaxTotalStake, {from: poolOwner});
  });

  describe("withdrawDeposit", async function() {
    it("should fail for non-owner", async function() {
      Util.assertTxFail(qspb.withdrawDeposit(0, {from: adversary}));
    });

    it("should succeed for the owner", async function() {
      assert.equal(await quantstampToken.balanceOf(poolOwner), Util.toQsp(0));
      assert.equal(await qspb.balanceQspWei(), initialDepositQspWei);
      assert.equal(await qspb.getPoolDepositQspWei(0), initialDepositQspWei);
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(await qspb.getPoolDepositQspWei(0), Util.toQsp(0));
      assert.equal(await quantstampToken.balanceOf(poolOwner), initialDepositQspWei);
      assert.equal(await qspb.balanceQspWei(), Util.toQsp(0));
    });

    it("should fail if balance is already 0", async function() {
      await qspb.withdrawDeposit(0, {from: poolOwner});
      Util.assertTxFail(qspb.withdrawDeposit(0, {from: poolOwner}));
    });

    it("should succeed if the policy is violated but the pool is in the Initialized state", async function() {
      assert.equal((await qspb.getPoolState(0)).toNumber(), PoolState.Initialized);
      await candidateContract.withdraw(await candidateContract.balance.call());
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(await qspb.getPoolDepositQspWei(0), Util.toQsp(0));
      assert.equal(await quantstampToken.balanceOf(poolOwner), initialDepositQspWei);
      assert.equal(await qspb.balanceQspWei(), Util.toQsp(0));
    });

    it("should succeed if the policy is violated but the pool is in the NotViolatedUnderfunded state", async function() {
      await qspb.stakeFunds(0, minStakeQspWei, {from: staker});
      assert.equal((await qspb.getPoolState(0)).toNumber(), PoolState.NotViolatedUnderfunded);
      await candidateContract.withdraw(await candidateContract.balance.call());
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(await qspb.getPoolDepositQspWei(0), Util.toQsp(0));
      assert.equal(await quantstampToken.balanceOf(poolOwner), initialDepositQspWei);
      assert.equal(await qspb.balanceQspWei(), minStakeQspWei);
    });

    it("should not allow the stakeholder to withdraw their deposit when the policy expired, before all stakers withdraw their payouts and stakes", async function() {
      await qspb.stakeFunds(0, minStakeQspWei, {from: staker});
      // deposit more QSP to make the pool fully funded
      await quantstampToken.transfer(poolOwner, maxPayableQspWei, {from : owner});
      await quantstampToken.approve(qspb.address, maxPayableQspWei, {from : poolOwner});
      await qspb.depositFunds(0, maxPayableQspWei, {from: poolOwner});
      assert.equal((await qspb.getPoolState(0)).toNumber(), PoolState.NotViolatedFunded);
      // wait until the policy expires
      await Util.mineNBlocks(minStakeTimeInBlocks);
      // nothing should be transfered to pool owner if he requests his deposit back
      const balanceOfPoolOwner = await quantstampToken.balanceOf(poolOwner);
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(balanceOfPoolOwner.toNumber(), (await quantstampToken.balanceOf(poolOwner)),
        "Current balance of stakeholder " + await quantstampToken.balanceOf(poolOwner) + " is different than exptected " + balanceOfPoolOwner);
      // stakers should be able to withdraw their stakes
      const balanceOfStaker = await quantstampToken.balanceOf(staker);
      await qspb.withdrawStake(0, {from: staker});
      assert.equal(balanceOfStaker.plus(minStakeQspWei).toNumber(), (await quantstampToken.balanceOf(staker)).toNumber());
      // afterwards the stakholder can withdraw his funds
      assert.equal(await qspb.getPoolTotalStakeQspWei(0), 0);
      const poolDeposit = await qspb.getPoolDepositQspWei(0);
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(balanceOfPoolOwner.plus(poolDeposit).toNumber(), (await quantstampToken.balanceOf(poolOwner)).toNumber());
      // it should fail if the stakeholder tries to withdraw their deposit when they have nothing left to withdraw
      Util.assertTxFail(qspb.withdrawDeposit(0, {from: poolOwner}));
    });

    it("should allow the stakeholder to withdraw their deposit when the policy expired twice even before all stakers withdraw their payouts and stakes", async function() {
      await qspb.stakeFunds(0, minStakeQspWei, {from: staker});
      // deposit more QSP to make the pool fully funded
      await quantstampToken.transfer(poolOwner, maxPayableQspWei, {from : owner});
      await quantstampToken.approve(qspb.address, maxPayableQspWei, {from : poolOwner});
      await qspb.depositFunds(0, maxPayableQspWei, {from: poolOwner});
      assert.equal((await qspb.getPoolState(0)).toNumber(), PoolState.NotViolatedFunded);
      // wait until the policy expires twice
      await Util.mineNBlocks(minStakeTimeInBlocks.times(2));
      // the stakholder can withdraw his funds
      const poolDeposit = await qspb.getPoolDepositQspWei(0);
      const balanceOfPoolOwner = await quantstampToken.balanceOf(poolOwner);
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(balanceOfPoolOwner.plus(poolDeposit).toNumber(), (await quantstampToken.balanceOf(poolOwner)).toNumber());
    });
  });

  describe("depositFunds", async function() {
    const addedDepositAmount = Util.toQsp(200);
    const totalExpectedDepositAmount = Util.toQsp(300);
    it("should fail for non-owner", async function() {
      await quantstampToken.transfer(adversary, addedDepositAmount, {from : owner});
      Util.assertTxFail(qspb.depositFunds(0, addedDepositAmount, {from: adversary}));
    });

    it("should succeed for the owner", async function() {
      await quantstampToken.transfer(poolOwner, addedDepositAmount, {from : owner});
      assert.equal(await quantstampToken.balanceOf(poolOwner), addedDepositAmount);
      assert.equal(await qspb.balanceQspWei(), initialDepositQspWei);
      assert.equal(await qspb.getPoolDepositQspWei(0), initialDepositQspWei);
      await quantstampToken.increaseAllowance(qspb.address, addedDepositAmount, {from : poolOwner});

      await qspb.depositFunds(0, addedDepositAmount, {from: poolOwner});

      assert.equal(await qspb.getPoolDepositQspWei(0), totalExpectedDepositAmount);
      assert.equal(await quantstampToken.balanceOf(poolOwner), Util.toQsp(0));
      assert.equal(await qspb.balanceQspWei(), totalExpectedDepositAmount);
    });

    it("should fail if there is no token approval", async function() {
      await quantstampToken.transfer(poolOwner, addedDepositAmount, {from : owner});
      assert.equal(await quantstampToken.balanceOf(poolOwner), addedDepositAmount);
      assert.equal(await qspb.getPoolDepositQspWei(0), initialDepositQspWei);

      Util.assertTxFail(qspb.depositFunds(0, addedDepositAmount, {from: poolOwner}));
    });

    it("should fail if the pool is in a Violated state", async function() {
      await quantstampToken.transfer(poolOwner, addedDepositAmount, {from : owner});
      await candidateContract.withdraw(await candidateContract.balance.call());
      Util.assertTxFail(qspb.depositFunds(0, addedDepositAmount, {from: poolOwner}));
    });

    it("should fail if the pool is in the Cancelled state", async function() {
      await quantstampToken.transfer(poolOwner, addedDepositAmount, {from : owner});
      await quantstampToken.increaseAllowance(qspb.address, addedDepositAmount, {from : poolOwner});
      await qspb.depositFunds(0, addedDepositAmount, {from: poolOwner});
      await qspb.withdrawDeposit(0, {from: poolOwner});
      assert.equal(await qspb.getPoolState(0), PoolState.Cancelled);
      Util.assertTxFail(qspb.depositFunds(0, addedDepositAmount, {from: poolOwner}));
    });
  });
});
