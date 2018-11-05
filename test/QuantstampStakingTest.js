const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));
const { ZERO_ADDRESS } = require('./constants.js');
const Util = require('./util.js');
const TCRUtil = require('./tcrutils.js');

contract('QuantstampStaking', function(accounts) {
  const owner = accounts[0];
  const poolOwner = accounts[3];
  const staker = accounts[4];
  const poolOwnerBudget = Util.toQsp(100000);
  const stakerBudget = Util.toQsp(100000);
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
  const depositQspWei = Util.toQsp(10);
  const bonusExpertFactor = 3;
  const bonusFirstExpertFactor = 5;
  const payPeriodInBlocks = 15;
  const minStakeTimeInBlocks = 10000;
  const timeoutInBlocks = 5;
  const urlOfAuditReport = "URL";

  let qspb;
  let quantstampToken;
  let quantstampRegistry;
  let candidateContract;
  let contractPolicy;
  let currentPoolNumber;
  let currentPoolIndex;

  it("should add a pool", async function() {
    qspb = await QuantstampStaking.deployed();
    quantstampToken = await QuantstampToken.deployed();
    quantstampRegistry = await QuantstampStakingRegistry.deployed();
    candidateContract = await CandidateContract.deployed();
    contractPolicy = await ZeroBalancePolicy.deployed();
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the poolOwner
    const poolOwnerBudget = Util.toQsp(1000);
    await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstampToken.approve(qspb.address, Util.toQsp(1000), {from : poolOwner});
    
    // balance should be 0 in the beginning
    assert.equal(await qspb.balanceQspWei.call(), 0);
    // create pool
    await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
      depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
      minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
    // check all pool properties
    assert.equal(await qspb.getPoolsLength.call(), 1);
    assert.equal(await qspb.getPoolCandidateContract(0), candidateContract.address);
    assert.equal(await qspb.getPoolContractPolicy(0), contractPolicy.address);
    assert.equal(await qspb.getPoolOwner(0), poolOwner);
    assert.equal(await qspb.getPoolMaxPayoutQspWei(0), maxPayoutQspWei);
    assert.equal(await qspb.getPoolMinStakeQspWei(0), minStakeQspWei);
    assert.equal(await qspb.getPoolDepositQspWei(0), depositQspWei);
    assert.equal(await qspb.getPoolBonusExpertFactor(0), bonusExpertFactor);
    assert.equal(await qspb.getPoolBonusFirstExpertFactor(0), bonusFirstExpertFactor);
    assert.equal(await qspb.getPoolPayPeriodInBlocks(0), payPeriodInBlocks);
    assert.equal(await qspb.getPoolMinStakeTimeInBlocks(0), minStakeTimeInBlocks);
    assert.equal(await qspb.getPoolTimeoutInBlocks(0), timeoutInBlocks);
    assert.equal(await qspb.getPoolTimeOfStateInBlocks(0), web3.eth.getBlock("latest").number);
    assert.equal(await qspb.getPoolUrlOfAuditReport(0), urlOfAuditReport);
    assert.equal(await qspb.getPoolState(0), PoolState.Initialized);
    // balance should be increased
    assert.equal(await qspb.balanceQspWei.call(), depositQspWei);
  });

  it("should have an owner", async function() {
    assert.equal(await qspb.owner(), owner);
  });

  it("should have the right token address", async function() {
    assert.equal(await qspb.getToken(), quantstampToken.address);
  });

  it("should have the right registry address", async function() {
    assert.equal(await qspb.getStakingRegistry(), quantstampRegistry.address);
  });

  describe("withdrawClaim", async function() {

    let quantstampToken;
    let qspb;
    let policy;
    let candidateContract;
    const staker = accounts[4];
    const admin = "0x0";
    const poolId = 0;
    const stakerBudget = Util.toQsp(1000);

    // vars needed for creating pool
    const depositQspWei = Util.toQsp(100);
    const maxPayableQspWei = 10;
    const minStakeQspWei = 1;
    const bonusExpertFactor = 3;
    const bonusFirstExpertFactor = 5;
    const payPeriodInBlocks = 15;
    const minStakeTimeInBlocks = 10000;
    const timeoutInBlocks = 100;
    const urlOfAuditReport = "URL";
    const policyBalance = 1;

    beforeEach("setup token and tcr", async function() {
      quantstampToken = await QuantstampToken.new(admin, {from : owner});
      candidateContract = await CandidateContract.new(policyBalance);
      quantstampRegistry = await QuantstampStakingRegistry.deployed();
      qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address);
      policy = await ZeroBalancePolicy.new();
      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      // transfer 100,000 QSP tokens to the pool owner
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      await quantstampToken.transfer(staker, stakerBudget, {from : owner});
      // allow the audit contract use tokens
      await quantstampToken.approve(qspb.address, depositQspWei, {from : poolOwner});
      // create pool
      await qspb.createPool(candidateContract.address, policy.address, maxPayableQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
      assert.equal(await Util.balanceOf(quantstampToken, poolOwner), poolOwnerBudget - depositQspWei);
    });

    it("should not allow claim withdraw when pool is initialized", async function() {
      // the pool state is already intialized
      assert.equal(await qspb.getPoolState(poolId), PoolState.Initialized);
      Util.assertTxFail(qspb.withdrawClaim(poolId, {from: poolOwner}));
    });
    
    it("should not allow claim withdraw when pool is cancelled", async function() {
      assert.equal(await qspb.getPoolState(poolId), PoolState.Initialized);
      // violate policy and cancel pool
      await candidateContract.withdraw(policyBalance);
      await qspb.checkPolicy(poolId);
      assert.equal(await qspb.getPoolState(poolId), PoolState.Cancelled);
      Util.assertTxFail(qspb.withdrawClaim(poolId, {from: poolOwner}));
    });

    it("should not allow claim withdraw by anyone other than the pool owner", async function() {
      // approve and stake funds
      await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
      await qspb.stakeFunds(poolId, minStakeQspWei, {from: staker});
      // this violates the policy
      await candidateContract.withdraw(policyBalance);
      assert.equal(await qspb.getPoolState(poolId), PoolState.NotViolatedFunded);
      // switch into the violated stata
      await qspb.checkPolicy(poolId);
      assert.equal(await qspb.getPoolState(poolId), PoolState.ViolatedFunded);
      Util.assertTxFail(qspb.withdrawClaim(poolId, {from: staker}));
    });

    it("should not allow claim withdraw when pool is not funded", async function() {
      var nextPool = poolId + 1;
      var maxPayout = depositQspWei + 10;
      // create another pool with deposit smaller than the payout
      await quantstampToken.approve(qspb.address, depositQspWei, {from : poolOwner});
      await qspb.createPool(candidateContract.address, policy.address, maxPayout, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
      // approve and stake funds
      await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
      await qspb.stakeFunds(nextPool, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(nextPool), PoolState.NotViolatedUnderfunded);
      Util.assertTxFail(qspb.withdrawClaim(nextPool, {from: poolOwner}));
    });

    it("should not allow claim withdraw when pool is not funded when violated", async function() {
      var nextPool = poolId + 1;
      var maxPayout = depositQspWei + 10;
      // create another pool with deposit smaller than the payout
      await quantstampToken.approve(qspb.address, depositQspWei, {from : poolOwner});
      await qspb.createPool(candidateContract.address, policy.address, maxPayout, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
      // approve and stake funds
      await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
      await qspb.stakeFunds(nextPool, minStakeQspWei, {from: staker});
      // violate policy
      await candidateContract.withdraw(policyBalance);
      assert.equal(await qspb.getPoolState(nextPool), PoolState.NotViolatedUnderfunded);
      // switch into the violated status
      await qspb.checkPolicy(nextPool);
      assert.equal(await qspb.getPoolState(nextPool), PoolState.ViolatedUnderfunded);
      Util.assertTxFail(qspb.withdrawClaim(nextPool, {from: poolOwner}));
    });

    it("should not allow claim withdraw when policy is not violated", async function() {
      // approve and stake funds
      await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
      await qspb.stakeFunds(poolId, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(poolId), PoolState.NotViolatedFunded);
      Util.assertTxFail(qspb.withdrawClaim(poolId, {from: poolOwner}));
    });

    it("pools allows claim withdraw when policy is violated via status and pool is funded",
      async function() {
        var originalBalance = (await Util.balanceOfRaw(quantstampToken, poolOwner)).plus(depositQspWei);
        // approve and stake funds
        await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
        await qspb.stakeFunds(poolId, minStakeQspWei, {from: staker});
        // this violates the policy
        await candidateContract.withdraw(policyBalance);
        assert.equal(await qspb.getPoolState(poolId), PoolState.NotViolatedFunded);
        // switch into the violated status
        await qspb.checkPolicy(poolId);
        assert.equal(await qspb.getPoolState(poolId), PoolState.ViolatedFunded);
        await qspb.withdrawClaim(poolId, {from: poolOwner});
        assert.equal(await Util.balanceOf(quantstampToken, poolOwner), originalBalance.plus(minStakeQspWei));
        assert.equal(await Util.balanceOf(quantstampToken, qspb.address), 0);
        assert.equal(await qspb.balanceQspWei.call(), 0);
      }
    );

    it("pools allows claim withdraw when policy is violated via policy and pool is funded",
      async function() {
        var originalBalance = (await Util.balanceOfRaw(quantstampToken, poolOwner)).plus(depositQspWei);
        // approve and stake funds
        await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
        await qspb.stakeFunds(poolId, minStakeQspWei, {from: staker});
        // this violates the policy
        await candidateContract.withdraw(policyBalance);
        assert.equal(await qspb.getPoolState(poolId), PoolState.NotViolatedFunded);
        await qspb.withdrawClaim(poolId, {from: poolOwner});
        assert.equal(await qspb.getPoolState(poolId), PoolState.ViolatedFunded);
        assert.equal(await Util.balanceOf(quantstampToken, poolOwner), originalBalance.plus(minStakeQspWei));
        assert.equal(await Util.balanceOf(quantstampToken, qspb.address), 0);
        assert.equal(await qspb.balanceQspWei.call(), 0);
      }
    );

    it("should only withdraw funds from the right pool and no other pool", async function() {
      var anotherDepositQspWei = Util.toQsp(300);
      var nextPool = poolId + 1;
      // create another pool
      await quantstampToken.approve(qspb.address, anotherDepositQspWei, {from : poolOwner});
      await qspb.createPool(candidateContract.address, policy.address, maxPayableQspWei, minStakeQspWei,
        anotherDepositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});

      await candidateContract.withdraw(policyBalance);
      await qspb.withdrawClaim(nextPool, {from: poolOwner});
      assert.equal(await qspb.getPoolState(nextPool), PoolState.ViolatedFunded);
      // there was one more pool created so we are subtracting one depositQspWei
      assert.equal(await Util.balanceOf(quantstampToken, poolOwner), poolOwnerBudget - depositQspWei);
      assert.equal(await qspb.getPoolState(poolId), PoolState.Initialized);
    });
  });

  it("should fail if a TCR with address zero is passed into the constructor", async function () {
    Util.assertTxFail(QuantstampStaking.new(quantstampToken.address, ZERO_ADDRESS));
  });

  describe("isExpert", async function() {

    it("should return true if the expert is on the list", async function() {
      const voting = await Voting.deployed();
      await voting.init(QuantstampToken.address);

      const quantstampParameterizer = await QuantstampParameterizer.deployed();
      await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);
      await quantstampRegistry.init(QuantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');

      const applicant = accounts[4];
      const listing = applicant;
      const minDeposit = TCRUtil.minDep;

      await quantstampToken.enableTransfer({from : owner});
      // transfer the minimum number of tokens to the requestor
      await quantstampToken.transfer(applicant, minDeposit, {from : owner});

      // allow the registry contract use up to minDeposit for audits
      await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : applicant});

      // allow the voting contract use up to minDeposit for audits
      await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicant});

      await TCRUtil.addToWhitelist(listing, minDeposit, applicant, quantstampRegistry);

      assert.strictEqual(await qspb.isExpert(applicant),true,'Applicant was not set as expert');
    });

    it("should return false if the expert is not on the list", async function() {
      assert.strictEqual(await qspb.isExpert(ZERO_ADDRESS),false,'Zero address was apparently an expert');
    });
  });

  describe("stakeFunds()", async function() {
    beforeEach("when staking funds", async function() {
      quantstampToken = await QuantstampToken.new(owner.address, {from: owner});
      quantstampRegistry = await QuantstampStakingRegistry.new();
      qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
      await quantstampToken.transfer(staker, stakerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker});
    
      await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
      currentPoolNumber = await qspb.getPoolsLength();
      currentPoolIndex = currentPoolNumber - 1;
    });

    it("should stake funds and keep the pool in the Initialized state", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei/2, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Initialized);
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + minStakeQspWei/2);
    });

    it("should not allow funds to be staked because the timeout has occured", async function() {
      Util.mineNBlocks(timeoutInBlocks);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Cancelled);
      // should throw an error since stakes cannot be made in the Cancelled state
      Util.assertTxFail(qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker}));
      assert.equal(await qspb.balanceQspWei.call(), depositQspWei);
    });

    it("should stake funds and set pool to NotViolatedUnderfunded", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedUnderfunded);
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(minStakeQspWei));
    });

    it("should stake funds and set pool to NotViolatedFunded", async function() {
      // TODO (sebi): Implement after UC-4 (depositFunds) is implemented
      // make deposit such that the current pool is funded
      // stake funds
      //await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      //assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      //assert.equal(await qspb.balanceQspWei.call(), parseInt(minStakeQspWei) + depositedFunds);
    });

    it("should not allow staking because the policy is violated", async function() {
      await candidateContract.withdraw(await candidateContract.balance.call());
      Util.assertTxFail(qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker}));
      assert.equal(await qspb.balanceQspWei.call(), depositQspWei);
    });
  });
});
