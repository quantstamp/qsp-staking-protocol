const Util = require("./util.js");
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const QuantstampStaking = artifacts.require('QuantstampStaking');
const WhitelistExpertRegistry = artifacts.require('WhitelistExpertRegistry');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const ZeroBalancePolicy = artifacts.require('policies/ZeroBalancePolicy');
const CandidateContract = artifacts.require('test/CandidateContract');
const TrivialBackdoorPolicy = artifacts.require('policies/TrivialBackdoorPolicy');
const TCRContainsEntryPolicy = artifacts.require('policies/TCRContainsEntryPolicy');
const DemocraticViolationPolicy = artifacts.require('policies/DemocraticViolationPolicy');
const TrustedOpinionPolicy = artifacts.require('policies/TrustedOpinionPolicy');
const StateNotChangedPolicy = artifacts.require('policies/StateNotChangedPolicy');
const AlwaysViolatedPolicy = artifacts.require('policies/AlwaysViolatedPolicy');
const NeverViolatedPolicy = artifacts.require('policies/NeverViolatedPolicy');
const UpgradeablePolicy = artifacts.require('policies/UpgradeablePolicy');
const ValueNotChangedPolicy = artifacts.require('policies/ValueNotChangedPolicy');
const QuantstampAssurancePolicy = artifacts.require('policies/QuantstampAssurancePolicy');
const BitcoinPricePolicy = artifacts.require('policies/BitcoinPricePolicy');
const TrustedOraclePolicy = artifacts.require('policies/TrustedOraclePolicy');
const Registry = artifacts.require('test/Registry');
const TCRUtil = require('./tcrutils.js');
const BigNumber = require('bignumber.js');


contract('CandidateContract', function(accounts) {

  // Necessary for TCR policy test
  const owner = accounts[0];
  let quantstampToken;
  const listing = accounts[9];

  let candidateContract;
  let zeroBalancePolicy;
  let trivialBackdoorPolicy;
  let tcr;
  let tcrContainsEntryPolicy;
  let democraticPolicy;
  let trustedOpinionPolicy;
  let stateNoteChangedPolicy;
  let alwaysViolatedPolicy;
  let neverViolatedPolicy;
  let upgradeablePolicy;
  let valueNotChangedPolicy;
  let bitcoinPricePolicy;
  let qaPolicy;
  let trustedOraclePolicy;
  let qspb;
  let quantstampStakingData;

  beforeEach(async function () {
    quantstampToken = await QuantstampToken.deployed();
    candidateContract = await CandidateContract.new(100);
    zeroBalancePolicy = await ZeroBalancePolicy.new(candidateContract.address);
    trivialBackdoorPolicy = await TrivialBackdoorPolicy.new(candidateContract.address);
    tcr = await Registry.new();
    tcrContainsEntryPolicy = await TCRContainsEntryPolicy.new(listing);
    democraticPolicy = await DemocraticViolationPolicy.new(2, candidateContract.address);
    trustedOpinionPolicy = await TrustedOpinionPolicy.new(2, candidateContract.address, owner);
    stateNoteChangedPolicy = await StateNotChangedPolicy.new(0);
    alwaysViolatedPolicy = await AlwaysViolatedPolicy.new(candidateContract.address);
    neverViolatedPolicy = await NeverViolatedPolicy.new(candidateContract.address);
    valueNotChangedPolicy = await ValueNotChangedPolicy.new(candidateContract.address);
    upgradeablePolicy = await UpgradeablePolicy.new(candidateContract.address, owner, neverViolatedPolicy.address);
    quantstampStakingData = await QuantstampStakingData.new(quantstampToken.address);
    const whitelistExpertRegistry = await WhitelistExpertRegistry.new();
    qspb = await QuantstampStaking.new(quantstampToken.address, whitelistExpertRegistry.address, quantstampStakingData.address);
    await quantstampStakingData.setWhitelistAddress(qspb.address);
    qaPolicy = await QuantstampAssurancePolicy.new(qspb.address, quantstampToken.address);
    trustedOraclePolicy = await TrustedOraclePolicy.new(owner);
  });

  describe('QuantstampAssurancePolicy', () => {
    it("should fail when attempted to be initialized with a non-assurance address", async function() {
      await Util.assertTxFail(QuantstampAssurancePolicy.new(Util.ZERO_ADDRESS, Util.ZERO_ADDRESS));
    });


    it("should throw an exception when the policy is checked with a different contract address", async function() {
      await Util.assertTxFail(qaPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should initially be violated", async function() {
      assert.isTrue(await qaPolicy.isViolated(qspb.address)); // true because we didn't set the poolId
    });

    it("should not be violated when a pool is funded", async function() {
      const owner = accounts[0];
      const poolOwner = accounts[3];
      const staker = accounts[4];
      const poolOwnerBudget = new BigNumber(Util.toQsp(100000));
      const stakerBudget = new BigNumber(Util.toQsp(1000));
      const maxPayoutQspWei = Util.toQsp(100);
      const minStakeQspWei = new BigNumber(Util.toQsp(10));
      const depositQspWei = new BigNumber(Util.toQsp(100));
      const bonusExpertFactor = 3;
      const bonusFirstExpertFactor = 5;
      const payPeriodInBlocks = 5;
      const minStakeTimeInBlocks = new BigNumber(10);
      const timeoutInBlocks = 5;
      const urlOfAuditReport = "URL";
      const poolName = "myPool";
      const defaultMaxTotalStake = 0;
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

      // enable transfers before any payments are allowed
      await quantstampToken.enableTransfer({from : owner});
      // transfer poolOwnerBudget QSP tokens to the poolOwner
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
      await quantstampToken.transfer(staker, stakerBudget, {from : owner});
      // allow the qspb contract use QSP
      await quantstampToken.approve(qspb.address, Util.toQsp(100000), {from : poolOwner});
      // balance should be 0 in the beginning
      assert.equal((await qspb.getBalanceQspWei()).toNumber(), 0);
      // create pool
      await qspb.createPool(qspb.address, qaPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, defaultMaxTotalStake, {from: poolOwner});


      // update the pool id in the policy contract
      assert.equal((await quantstampStakingData.getPoolIndex(poolName)).toNumber(), 0);
      await qaPolicy.setAssurancePoolId(0);

      // stake
      await quantstampToken.approve(qspb.address, minStakeQspWei, {from : staker});
      let currentPool = 0;
      await qspb.stakeFunds(currentPool, minStakeQspWei, {from: staker});
      let currentState = (await qspb.getPoolState(currentPool)).toNumber();
      assert.isTrue(currentState == PoolState.NotViolatedFunded);
      assert.isFalse(await qaPolicy.isViolated(qspb.address));
    });
  });

  describe('UpgradeablePolicy', () => {
    it("should throw an exception when the policy is checked with a different contract address", async function() {
      await Util.assertTxFail(upgradeablePolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially be violated", async function() {
      assert.isFalse(await upgradeablePolicy.isViolated(candidateContract.address));
    });

    it("should be violated after the logic is updated", async function() {
      await upgradeablePolicy.changePolicyLogic(alwaysViolatedPolicy.address, {from : owner});
      assert.isTrue(await upgradeablePolicy.isViolated(candidateContract.address));
    });

    it("should throw an error when queried after upgrading to a non-policy address", async function() {
      await upgradeablePolicy.changePolicyLogic(Util.ZERO_ADDRESS, {from : owner});
      await Util.assertTxFail(upgradeablePolicy.isViolated(candidateContract.address));
    });
  });
  describe('ValueNotChangedPolicy', () => {
    it("should not matter when the policy is checked with a non-CandidateContract address", async function() {
      Util.assertTxFail(valueNotChangedPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially be violated", async function() {
      assert.isFalse(await valueNotChangedPolicy.isViolated(candidateContract.address));
    });

    it("should be violated after the balance changes", async function() {
      await candidateContract.withdraw(1);
      assert.isTrue(await valueNotChangedPolicy.isViolated(candidateContract.address));
    });

  });

  describe('ZeroBalancePolicy', () => {
    it("should not initially violate the zero-balance policy", async function() {
      assert.isFalse(await zeroBalancePolicy.isViolated(candidateContract.address));
    });

    it("should violate the zero-balance policy after the balance is withdrawn", async function() {
      await candidateContract.withdraw(await candidateContract.balance.call());
      assert.isTrue(await zeroBalancePolicy.isViolated(candidateContract.address));
    });

    it("should throw an error", async function() {
      await Util.assertTxFail(zeroBalancePolicy.isViolated(accounts[0]));
    });
  });

  describe('TrivialBackdoorPolicy', () => {
    it("should not initially violate the trivial-backdoor policy", async function() {
      assert.isFalse(await trivialBackdoorPolicy.isViolated(candidateContract.address));
    });

    it("should violate the trivial-backdoor policy after that policy status is updated", async function() {
      await trivialBackdoorPolicy.updateStatus(true);
      assert.isTrue(await trivialBackdoorPolicy.isViolated(candidateContract.address));
    });
  });

  describe('TCRContainsEntryPolicy', () => {
    it("should not matter when the TCR entry policy is checked with a non-TCR address", async function() {
      await Util.assertTxFail(tcrContainsEntryPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should initially violate the TCR entry policy (entry missing)", async function() {
      assert.isTrue(await tcrContainsEntryPolicy.isViolated(tcr.address));
    });

    it("should no longer violate the TCR entry policy once the TCR is updated (entry is whitelisted)", async function() {
      const voting = await Voting.new();
      await voting.init(quantstampToken.address);
      const quantstampParameterizer = await QuantstampParameterizer.new();
      await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
      await tcr.init(quantstampToken.address, voting.address, quantstampParameterizer.address, 'QSPtest');
      const applicant = listing;
      const minDeposit = TCRUtil.minDep;
      await quantstampToken.enableTransfer({from : owner});
      // transfer the minimum number of tokens to the requestor
      await quantstampToken.transfer(applicant, minDeposit, {from : owner});
      // allow the registry contract use up to minDeposit for audits
      await quantstampToken.approve(tcr.address, Util.toQsp(minDeposit), {from : applicant});
      // allow the voting contract use up to minDeposit for audits
      await quantstampToken.approve(voting.address, Util.toQsp(minDeposit), {from : applicant});
      await TCRUtil.addToWhitelist(listing, minDeposit, applicant, tcr);
      assert.isFalse(await tcrContainsEntryPolicy.isViolated(tcr.address));
    });
  });

  describe('DemocraticViolationPolicy', () => {
    it("should not matter when the democratic opinion policy is checked with the wrong address", async function() {
      await Util.assertTxFail(democraticPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially violate the democratic policy", async function() {
      assert.isFalse(await democraticPolicy.isViolated(candidateContract.address));
    });

    it("should not have its status voted on by the same address more than once", async function() {
      await democraticPolicy.vote(1, {from: accounts[1]});
      await Util.assertTxFail(democraticPolicy.vote(1, {from: accounts[1]}));
    });

    it("should violate the democratic policy after some people vote for violation", async function() {
      await democraticPolicy.vote(1, {from: accounts[2]});
      await democraticPolicy.vote(1, {from: accounts[3]});
      assert.isTrue(await democraticPolicy.isViolated(candidateContract.address));
    });
  });

  describe('TrustedOpinionPolicy', () => {
    it("should not matter when the trusted opinion policy is checked with the wrong address", async function() {
      await Util.assertTxFail(trustedOpinionPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially violate the trusted opinion policy", async function() {
      assert.isFalse(await trustedOpinionPolicy.isViolated(candidateContract.address));
    });

    it("should violate the trusted policy after some trusted people vote for violation", async function() {
      await trustedOpinionPolicy.giveRightToVote(accounts[2], {from: accounts[0]});
      await trustedOpinionPolicy.giveRightToVote(accounts[3], {from: accounts[0]});
      await trustedOpinionPolicy.vote(1, {from: accounts[2]});
      await trustedOpinionPolicy.vote(1, {from: accounts[3]});
      assert.isTrue(await trustedOpinionPolicy.isViolated(candidateContract.address));
    });
  });

  describe('StateNotChangedPolicy', () => {
    it("should not matter when the State Not Changed Policy is checked with a non-CandidateContract address", async function() {
      await Util.assertTxFail(stateNoteChangedPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially violate the State Not Changed Policy", async function() {
      assert.isFalse(await stateNoteChangedPolicy.isViolated(candidateContract.address));
    });

    it("should violate the State Not Changed Policy after the contract is locked", async function() {
      await candidateContract.lockContract();
      assert.isTrue(await stateNoteChangedPolicy.isViolated(candidateContract.address));
    });
  });

  describe('BitcoinPricePolicy', () => {
    it("should not be violated if the price is lower than 1.000.000 USD", async function() {
      const thresholdPriceUSCents = 100000000;
      bitcoinPricePolicy = await BitcoinPricePolicy.new(thresholdPriceUSCents, false);
      await bitcoinPricePolicy.getAllPrices();
      assert.isFalse(await bitcoinPricePolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not be violated if the price is higher than 1.000 USD", async function() {
      const thresholdPriceUSCents = 100000;
      bitcoinPricePolicy = await BitcoinPricePolicy.new(thresholdPriceUSCents, true);
      await bitcoinPricePolicy.getAllPrices();
      assert.isFalse(await bitcoinPricePolicy.isViolated(Util.ZERO_ADDRESS));
	});
  });

  describe('TrustedOraclePolicy', () => {
    let trustedOracle;

    beforeEach("when using TrustedOraclePolicy", async function() {
      trustedOracle = await trustedOraclePolicy.getOracleAddress();
    });

    it("should not allow anyone other than the trusted oracle to trigger a violation", async function() {
      assert.notEqual(trustedOracle, accounts[1]);
      await Util.assertTxFail(trustedOraclePolicy.triggerViolation(candidateContract.address, {from: accounts[1]}));
    });

    it("should not be violated by default", async function() {
      assert.isFalse(await trustedOraclePolicy.isViolated(candidateContract.address));
    });

    it("should allow the trusted oracle to trigger a violation", async function() {
      await trustedOraclePolicy.triggerViolation(candidateContract.address, {from: trustedOracle});
      assert.isTrue(await trustedOraclePolicy.isViolated(candidateContract.address));
    });
  });
});

