const Util = require("./util.js");
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const QuantstampStaking = artifacts.require('QuantstampStaking');
const ZeroBalancePolicy = artifacts.require('policies/ZeroBalancePolicy');
const CandidateContract = artifacts.require('test/CandidateContract');
const TrivialBackdoorPolicy = artifacts.require('policies/TrivialBackdoorPolicy');
const TCRContainsEntryPolicy = artifacts.require('policies/TCRContainsEntryPolicy');
const DemocraticViolationPolicy = artifacts.require('policies/DemocraticViolationPolicy');
const TrustedOpinionPolicy = artifacts.require('policies/TrustedOpinionPolicy');
const CandidateToken = artifacts.require('test/CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('policies/TotalSupplyNotExceededPolicy');
const OwnerNotChangedPolicy = artifacts.require('policies/OwnerNotChangedPolicy');
const TCROpinionPolicy = artifacts.require('policies/TCROpinionPolicy');
const StateNotChangedPolicy = artifacts.require('policies/StateNotChangedPolicy');
const AlwaysViolatedPolicy = artifacts.require('policies/AlwaysViolatedPolicy');
const NeverViolatedPolicy = artifacts.require('policies/NeverViolatedPolicy');
const UpgradeablePolicy = artifacts.require('policies/UpgradeablePolicy');
const QuantstampAssurancePolicy = artifacts.require('policies/QuantstampAssurancePolicy');
const Registry = artifacts.require('test/Registry');
const TCRUtil = require('./tcrutils.js');

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
  let qaPolicy;
  let qspb;

  beforeEach(async function () {
    quantstampToken = await QuantstampToken.deployed();
    candidateContract = await CandidateContract.deployed();
    zeroBalancePolicy = await ZeroBalancePolicy.deployed();
    trivialBackdoorPolicy = await TrivialBackdoorPolicy.deployed();
    tcr = await Registry.deployed();
    tcrContainsEntryPolicy = await TCRContainsEntryPolicy.new(listing);
    democraticPolicy = await DemocraticViolationPolicy.deployed();
    trustedOpinionPolicy = await TrustedOpinionPolicy.new(2, candidateContract.address, owner);
    stateNoteChangedPolicy = await StateNotChangedPolicy.deployed();
    alwaysViolatedPolicy = await AlwaysViolatedPolicy.deployed();
    neverViolatedPolicy = await NeverViolatedPolicy.deployed();
    upgradeablePolicy = await UpgradeablePolicy.new(candidateContract.address, owner, neverViolatedPolicy.address);
    qspb = await QuantstampStaking.deployed();
    qaPolicy = await QuantstampAssurancePolicy.deployed();
  });

  describe('UpgradeablePolicy', () => {
    it("should throw an exception when the policy is checked with a different contract address", async function() {
      Util.assertTxFail(upgradeablePolicy.isViolated(Util.ZERO_ADDRESS));
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
      Util.assertTxFail(upgradeablePolicy.isViolated(candidateContract.address));
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
      Util.assertTxFail(zeroBalancePolicy.isViolated(accounts[0]));
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
      Util.assertTxFail(tcrContainsEntryPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should initially violate the TCR entry policy (entry missing)", async function() {
      assert.isTrue(await tcrContainsEntryPolicy.isViolated(tcr.address));
    });

    it("should no longer violate the TCR entry policy once the TCR is updated (entry is whitelisted)", async function() {
      const voting = await Voting.deployed();
      await voting.init(QuantstampToken.address);
      const quantstampParameterizer = await QuantstampParameterizer.deployed();
      await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);
      await tcr.init(QuantstampToken.address, voting.address, quantstampParameterizer.address, 'QSPtest');
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
      Util.assertTxFail(democraticPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially violate the democratic policy", async function() {
      assert.isFalse(await democraticPolicy.isViolated(candidateContract.address));
    });

    it("should not have its status voted on by the same address more than once", async function() {
      await democraticPolicy.vote(1, {from: accounts[1]});
      Util.assertTxFail(democraticPolicy.vote(1, {from: accounts[1]}));
    });

    it("should violate the democratic policy after some people vote for violation", async function() {
      await democraticPolicy.vote(1, {from: accounts[2]});
      await democraticPolicy.vote(1, {from: accounts[3]});
      assert.isTrue(await democraticPolicy.isViolated(candidateContract.address));
    });
  });

  describe('TrustedOpinionPolicy', () => {
    it("should not matter when the trusted opinion policy is checked with the wrong address", async function() {
      Util.assertTxFail(trustedOpinionPolicy.isViolated(Util.ZERO_ADDRESS));
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
      Util.assertTxFail(stateNoteChangedPolicy.isViolated(Util.ZERO_ADDRESS));
    });

    it("should not initially violate the State Not Changed Policy", async function() {
      assert.isFalse(await stateNoteChangedPolicy.isViolated(candidateContract.address));
    });

    it("should violate the State Not Changed Policy after the contract is locked", async function() {
      await candidateContract.lockContract();
      assert.isTrue(await stateNoteChangedPolicy.isViolated(candidateContract.address));
    });
  });

});

contract('CandidateToken', function(accounts) {
  const owner = accounts[0];
  const newOwner = accounts[1];

  let candidateToken;
  let totalSupplyPolicy;
  let ownerNotChangedPolicy;

  beforeEach(async function () {
    candidateToken = await CandidateToken.deployed();
    totalSupplyPolicy = await TotalSupplyNotExceededPolicy.deployed();
    ownerNotChangedPolicy = await OwnerNotChangedPolicy.new(owner);
  });

  describe('TotalSupplyNotExceededPolicy', () => {
    it("should not matter when the total supply policy is checked with a non-token address", async function() {
      Util.assertTxFail(totalSupplyPolicy.isViolated(owner));
    });

    it("should not initially violate minted tokens policy (no tokens minted yet)", async function() {
      assert.isFalse(await totalSupplyPolicy.isViolated(candidateToken.address));
    });

    it("should violate the minted tokens policy when too many (1) additional tokens are minted", async function() {
      await candidateToken.mint(owner, 1);
      assert.isTrue(await totalSupplyPolicy.isViolated(candidateToken.address));
    });
  });

  describe('OwnerNotChangedPolicy', () => {
    it("should not violate the OwnerNotChangedPolicy if the owner remains the same", async function() {
      assert.isFalse(await ownerNotChangedPolicy.isViolated(candidateToken.address));
    });

    it("should throw an exception on OwnerNotChangedPolicy if the address is not compatible with Candidate Token", async function() {
      Util.assertTxFail(ownerNotChangedPolicy.isViolated(totalSupplyPolicy.address));
    });

    it("should violate the OwnerNotChangedPolicy if the owner has changed", async function() {
      candidateToken.transferOwnership(newOwner);
      assert.isTrue(await ownerNotChangedPolicy.isViolated(candidateToken.address));
    });
  });

  describe('TCROpinionPolicy', () => {
    let tcrOpinionPolicy;
    let quantstampParameterizer;
    let quantstampToken;
    let expertTCR;
    let voting;
    let applicantA;
    let applicantB;
    let applicantC;
    let listingA;
    let listingB;
    let listingC;
    let minDeposit;

    before(async function () {
      voting = await Voting.deployed();
      await voting.init(QuantstampToken.address);
      expertTCR = await Registry.deployed();
      quantstampToken = await QuantstampToken.deployed();
      quantstampParameterizer = await QuantstampParameterizer.deployed();
      await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);
      await expertTCR.init(QuantstampToken.address, voting.address, quantstampParameterizer.address, 'QSPtest');
      tcrOpinionPolicy = await TCROpinionPolicy.new(2, candidateToken.address, expertTCR.address);

      applicantA = accounts[9];
      listingA = applicantA;
      applicantB = accounts[8];
      listingB = applicantB;
      applicantC = accounts[7];
      listingC = applicantC;
      minDeposit = TCRUtil.minDep;
      await quantstampToken.enableTransfer({from : owner});
      // transfer the minimum number of tokens to the requestor
      await quantstampToken.transfer(applicantA, minDeposit, {from : owner});
      // allow the registry contract use up to minDeposit for audits
      await quantstampToken.approve(expertTCR.address, Util.toQsp(minDeposit), {from : applicantA});
      // allow the voting contract use up to minDeposit for audits
      await quantstampToken.approve(voting.address, Util.toQsp(minDeposit), {from : applicantA});
      await TCRUtil.addToWhitelist(listingA, minDeposit, applicantA, expertTCR);
      await quantstampToken.enableTransfer({from : owner});
      // transfer the minimum number of tokens to the requestor
      await quantstampToken.transfer(applicantB, minDeposit, {from : owner});
      // allow the registry contract use up to minDeposit for audits
      await quantstampToken.approve(expertTCR.address, Util.toQsp(minDeposit), {from : applicantB});
      // allow the voting contract use up to minDeposit for audits
      await quantstampToken.approve(voting.address, Util.toQsp(minDeposit), {from : applicantB});
      await TCRUtil.addToWhitelist(listingB, minDeposit, applicantB, expertTCR);
      // transfer the minimum number of tokens to the requestor
      await quantstampToken.transfer(applicantC, minDeposit, {from : owner});
      // allow the registry contract use up to minDeposit for audits
      await quantstampToken.approve(expertTCR.address, Util.toQsp(minDeposit), {from : applicantC});
      // allow the voting contract use up to minDeposit for audits
      await quantstampToken.approve(voting.address, Util.toQsp(minDeposit), {from : applicantC});
    });

    it("should not matter when the TCR policy is checked with a non-TCR address as an argument for the policy", async function() {
      Util.assertTxFail(tcrOpinionPolicy.isViolated(owner));
    });

    it("should not be violated by the TCR policy before experts vote", async function() {
      assert.isFalse(await tcrOpinionPolicy.isViolated(candidateToken.address));
    });

    it("should not be violated by the TCR policy after 1 expert votes (quorum not met)", async function() {
      await tcrOpinionPolicy.vote(true, {from: applicantA});
      assert.isFalse(await tcrOpinionPolicy.isViolated(candidateToken.address));
    });

    it("should not be violated if there is a tie", async function() {
      await TCRUtil.addToWhitelist(listingC, minDeposit, applicantC, expertTCR);
      await tcrOpinionPolicy.vote(false, {from: applicantC});
      assert.isFalse(await tcrOpinionPolicy.isViolated(candidateToken.address));
    });

    it("should be violated by the TCR policy after 2 experts vote in favor (and the second changes their vote)", async function() {
      // ApplicantA votes in the previous test.
      await tcrOpinionPolicy.vote(false, {from: applicantB});
      await tcrOpinionPolicy.vote(true, {from: applicantB});
      assert.isTrue(await tcrOpinionPolicy.isViolated(candidateToken.address));
    });
  });
});
