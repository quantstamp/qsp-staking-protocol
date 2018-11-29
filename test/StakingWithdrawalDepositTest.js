const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const Util = require("./util.js");
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');

contract('QuantstampStaking: stakeholder deposits and withdrawals', function(accounts) {
  const owner = accounts[0];
  const qspAdmin = accounts[1];
  const poolOwner = accounts[3];
  const adversary = accounts[4];
  const poolOwnerBudget = Util.toQsp(100);
  const candidateContractBalance = Util.toEther(100);
  
  let qspb;
  let quantstampToken;
  let candidateContract;
  let contractPolicy;
  let quantstampRegistry;
  const initialDepositQspWei = poolOwnerBudget;
  const minStakeQspWei = Util.toQsp(10);

  beforeEach(async function() {
    quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
    quantstampRegistry = await QuantstampStakingRegistry.new();
    candidateContract = await CandidateContract.new(candidateContractBalance);
    contractPolicy = await ZeroBalancePolicy.new();
    
    qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
    await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});

    assert.equal(await qspb.balanceQspWei.call(), 0);

    const maxPayableQspWei = 10;
    const bonusExpertFactor = 3;
    const bonusFirstExpertFactor = 5;
    const payPeriodInBlocks = 15;
    const minStakeTimeInBlocks = 10000;
    const timeoutInBlocks = 100;
    const urlOfAuditReport = "URL";
    const poolName = "myPool";
    
    // create pool
    await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayableQspWei, minStakeQspWei,
      initialDepositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
      minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, {from: poolOwner});
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

    it("should fail if the pool is in a Violated state", async function() {
      await candidateContract.withdraw(await candidateContract.balance.call());
      Util.assertTxFail(qspb.withdrawDeposit(0, {from: poolOwner}));
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
      Util.assertTxFail(qspb.depositFunds(0, addedDepositAmount, {from: poolOwner}));
    });
  });
});
