const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('test/Registry');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));
const Util = require('./util.js');
const TCRUtil = require('./tcrutils.js');
const BigNumber = require('bignumber.js');

contract('QuantstampStaking', function(accounts) {
  const owner = accounts[0];
  const qspAdmin = accounts[1];
  const poolOwner = accounts[3];
  const staker = accounts[4];
  const staker2 = accounts[5];
  const staker3 = accounts[6];
  const poolOwnerBudget = Util.toQsp(100000);
  const stakerBudget = Util.toQsp("100000");
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
  const depositQspWei = Util.toQsp(10);
  const bonusExpertFactor = 3;
  const bonusFirstExpertFactor = 5;
  const payPeriodInBlocks = 5;
  const minStakeTimeInBlocks = 10;
  const timeoutInBlocks = 5;
  const urlOfAuditReport = "URL";

  let qspb;
  let quantstampToken;
  let quantstampRegistry;
  let candidateContract;
  let contractPolicy;
  let poolState;
  let currentPoolNumber;
  let currentPoolIndex;

  describe("constructor", async function() {
    it("should not be able to construct the QuantstampAssurnce contract if the token address is 0", async function() {
      quantstampRegistry = await QuantstampStakingRegistry.new();
      Util.assertTxFail(QuantstampStaking.new(Util.ZERO_ADDRESS, quantstampRegistry.address, {from: owner}));
    });

    it("should fail if a TCR with address zero is passed into the constructor", async function () {
      quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
      Util.assertTxFail(QuantstampStaking.new(quantstampToken.address, Util.ZERO_ADDRESS));
    });
  });

  describe("createPool", async function() {
    it("should not create a pool if it cannot transfer the deposit from the pool owner", async function() {
      qspb = await QuantstampStaking.deployed();
      quantstampToken = await QuantstampToken.deployed();
      quantstampRegistry = await QuantstampStakingRegistry.deployed();
      candidateContract = await CandidateContract.deployed();
      contractPolicy = await ZeroBalancePolicy.deployed();
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner}));
    });

    it("should add a pool", async function() {
      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      // transfer poolOwnerBudget QSP tokens to the poolOwner
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      // allow the qspb contract use up to 1000QSP
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

    it("should not create a pool if the initial deposit is zero", async function() {
      // This would lead to the risk of stakers never getting payed. Therefore, no one will place a stake 
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei,
        minStakeQspWei, 0, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner}));
    });

    it("should not create a pool if the maximum payout per period is zero", async function() {
      // This would mean that the stakeholder would not pay any stakers, which would lead to no stakes
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, 0,
        minStakeQspWei, depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner}));
    });

    it("should not create a pool if the minimum stake that needs to be collected is zero", async function() {
      // This would mean that a pool is active without any funds staked, which would not be in the interest of a stakeholder
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei,
        0, depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner}));
    });

    it("should not create a pool if the pay period is zero", async function() {
      // This would lead to a division by zero in the payout computation function and it would mean that
      // payouts are awarded all the time, which could quickly deplate all the deposited funds of the stakeholder
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei,
        minStakeQspWei, depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, 0,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner}));
    });

    it("should not create a pool if the minimum staking time is zero", async function() {
      // This would mean that a staker could withdraw their stake at any time from the pool, which would leave the
      // stakeholder unprotected in case an attack is discovered
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei,
        minStakeQspWei, depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        0, timeoutInBlocks, urlOfAuditReport, {from: poolOwner}));
    });

    it("should not create a pool if the timeout period is zero", async function() {
      // This would place the pool in the cancelled state immediately even if the first interaction is placing a stake
      Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei,
        minStakeQspWei, depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, 0, urlOfAuditReport, {from: poolOwner}));
    });
  });

  describe("withdrawClaim", async function() {

    let quantstampToken;
    let qspb;
    let policy;
    let candidateContract;
    const staker = accounts[4];
    const admin = "0x0";
    const poolId = 0;
    const stakerBudget = Util.toQsp("1000");

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
      quantstampToken = await QuantstampToken.new(qspAdmin, {from : owner});
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

    it("should fail if policy is not violated", async function() {
      Util.assertTxFail(qspb.checkPolicy(poolId));
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
      assert.strictEqual(await qspb.isExpert(Util.ZERO_ADDRESS),false,'Zero address was apparently an expert');
    });
  });

  describe("stakeFunds", async function() {
    beforeEach("when staking funds", async function() {
      const minDeposit = TCRUtil.minDep;
      quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
      const voting = await Voting.new(quantstampToken.address);
      const quantstampParameterizer = await QuantstampParameterizer.new();
      await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
      const quantstampRegistry = await QuantstampStakingRegistry.new();
      await quantstampRegistry.init(quantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');
      qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
      await quantstampToken.transfer(staker, stakerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker});
      await quantstampToken.transfer(staker2, parseInt(stakerBudget) + 2 * Util.toQsp(minDeposit), {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker2});
      await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : staker2});
      await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : staker2});
      await TCRUtil.addToWhitelist(staker2, minDeposit, staker2, quantstampRegistry);
      await quantstampToken.transfer(staker3, parseInt(stakerBudget) + 2 * Util.toQsp(minDeposit), {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker3});
      await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : staker3});
      await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : staker3});
      await TCRUtil.addToWhitelist(staker3, minDeposit, staker3, quantstampRegistry);
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
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex),
        minStakeQspWei/2);
      assert.equal(await qspb.getPoolStakeCount(currentPoolIndex), 1);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), minStakeQspWei/2);
    });

    it("should not allow funds to be staked because the timeout has occured", async function() {
      Util.mineNBlocks(timeoutInBlocks);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Cancelled);
      // should throw an error since stakes cannot be made in the Cancelled state
      Util.assertTxFail(qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker}));
      assert.equal(await qspb.balanceQspWei.call(), depositQspWei);
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), 0);
      assert.equal(await qspb.getPoolStakeCount(currentPoolIndex), 0);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), 0);
    });

    it("should stake funds and set pool to NotViolatedUnderfunded", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedUnderfunded);
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(minStakeQspWei));
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex),
        minStakeQspWei);
      assert.equal(await qspb.getPoolStakeCount(currentPoolIndex), 1);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), minStakeQspWei);
    });

    it("should stake funds and set pool to NotViolatedFunded", async function() {
      // make deposit such that the current pool is funded
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei, {from: poolOwner});
      // stake funds
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(minStakeQspWei) + parseInt(maxPayoutQspWei));
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), minStakeQspWei);
      assert.equal(await qspb.getPoolStakeCount(currentPoolIndex), 1);
      assert.equal((await qspb.getPoolSizeQspWei(currentPoolIndex)).toNumber(), minStakeQspWei);
    });

    it("should set the first expert staker of the pool correctly", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.isExpert(staker), false);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      assert.equal(await qspb.isExpert(staker2), true);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker3});
      assert.equal(await qspb.isExpert(staker3), true);
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      // the first expert staker is staker2
      assert.equal(await qspb.getPoolFirstExpertStaker(currentPoolIndex), staker2);
      assert.equal(await qspb.getPoolStakeCount(currentPoolIndex), 4);
      // compute whta the pool size should be according to the bonuses and stakes in the pool
      const bonusExpert = new BigNumber(bonusExpertFactor);
      const bonusFirstExpert = new BigNumber(bonusFirstExpertFactor);
      var poolSize = new BigNumber(minStakeQspWei);
      poolSize = poolSize.
        plus(poolSize.times(bonusExpert.plus(100)).times(bonusFirstExpert.plus(100)).dividedBy(new BigNumber(100).pow(2))).
        plus(poolSize.times(bonusExpert.pow(2).plus(new BigNumber(100).pow(2))).dividedBy(new BigNumber(100).pow(2))).
        plus(poolSize.times(bonusExpert.pow(3).plus(new BigNumber(100).pow(3))).dividedBy(new BigNumber(100).pow(3)));
      assert.equal(parseInt(await qspb.getPoolSizeQspWei(currentPoolIndex)), poolSize.toString());
    });

    it("should not allow staking because the policy is violated", async function() {
      await candidateContract.withdraw(await candidateContract.balance.call());
      Util.assertTxFail(qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker}));
      assert.equal(await qspb.balanceQspWei.call(), depositQspWei);
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), 0);
      assert.equal(await qspb.getPoolStakeCount(currentPoolIndex), 0);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), 0);
    });
  });

  describe("withdrawStake", async function() {
    beforeEach("when withdrawing stakes", async function() {
      quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
      quantstampRegistry = await QuantstampStakingRegistry.new();
      qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
      candidateContract = await CandidateContract.new(candidateContractBalance);
      contractPolicy = await ZeroBalancePolicy.new();
      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
      await quantstampToken.transfer(staker, stakerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker});
      await quantstampToken.transfer(staker2, stakerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker2});

      // create pool and stake funds
      await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
      currentPoolNumber = await qspb.getPoolsLength();
      currentPoolIndex = currentPoolNumber - 1;
    });

    it("should not withdraw stake, since calling staker did not place any stake", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(minStakeQspWei));
      poolState = await qspb.getPoolState(currentPoolIndex);
      await qspb.withdrawStake(currentPoolIndex, {from: staker2});
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(minStakeQspWei));
      assert.equal(await qspb.getPoolState(currentPoolIndex), parseInt(poolState));
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), minStakeQspWei);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), minStakeQspWei);
    });

    it("should withdraw stake and pool should switch to Cancelled state", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      await qspb.withdrawStake(currentPoolIndex, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Cancelled);
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), 0);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), 0);
    });

    it("should withdraw stake and pool should remain in same state", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker2});
      poolState = await qspb.getPoolState(currentPoolIndex);
      await qspb.withdrawStake(currentPoolIndex, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), parseInt(poolState));
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), minStakeQspWei);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), minStakeQspWei);
    });

    it("should not withdraw stake because policy is violated", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      await candidateContract.withdraw(await candidateContract.balance.call());
      Util.assertTxFail(qspb.withdrawStake(currentPoolIndex, {from: staker}));
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(minStakeQspWei));
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), minStakeQspWei);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), minStakeQspWei);
    });

    it("should not withdraw stake before the policy period", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei, {from: poolOwner});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      Util.assertTxFail(qspb.withdrawStake(currentPoolIndex, {from: staker}));
    });

    it("should withdraw stake after the policy period", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      await qspb.depositFunds(currentPoolIndex, maxPayoutQspWei, {from: poolOwner});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.NotViolatedFunded);
      Util.mineNBlocks(minStakeTimeInBlocks);
      await qspb.withdrawStake(currentPoolIndex, {from: staker});
      assert.equal(await qspb.getPoolState(currentPoolIndex), PoolState.Cancelled);
      assert.equal(await qspb.balanceQspWei.call(), parseInt(depositQspWei) + parseInt(maxPayoutQspWei));
      assert.equal(await qspb.getPoolTotalStakeQspWei(currentPoolIndex), 0);
      assert.equal(await qspb.getPoolSizeQspWei(currentPoolIndex), 0);
    });
  });

  describe("isStaker", async function() {
    beforeEach("when the GUI needs to check if the current user is a staker in a pool", async function() {
      quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
      quantstampRegistry = await QuantstampStakingRegistry.new();
      qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
      candidateContract = await CandidateContract.new(candidateContractBalance);
      contractPolicy = await ZeroBalancePolicy.new();
      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
      await quantstampToken.transfer(staker, stakerBudget, {from : owner});
      await quantstampToken.approve(qspb.address, stakerBudget, {from : staker});
      
      // create pool and stake funds
      await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
      currentPoolNumber = await qspb.getPoolsLength();
      currentPoolIndex = currentPoolNumber - 1;
    });

    it("should return false for a pool that does not exist", async function() {
      assert.equal(await qspb.isStaker(currentPoolIndex + 10, staker), false);
    });

    it("should return false if the pool does not have any stakes yet", async function() {
      assert.equal(await qspb.isStaker(currentPoolIndex, staker), false);
    });

    it("should return true if the staker has a stake in the pool", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      assert.equal(await qspb.isStaker(currentPoolIndex, staker), true);
    });

    it("should return false if the staker has withdrawn his stake from the pool", async function() {
      await qspb.stakeFunds(currentPoolIndex, minStakeQspWei, {from: staker});
      Util.mineNBlocks(minStakeTimeInBlocks/2);
      await qspb.withdrawStake(currentPoolIndex, {from: staker});
      assert.equal(await qspb.isStaker(currentPoolIndex, staker), false);
    });
  });
});
