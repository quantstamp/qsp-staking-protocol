const Util = require("./util.js");
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const QuantstampToken = artifacts.require('test/QuantstampToken');
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
const BigNumber = require('bignumber.js');


contract('CandidateToken', function(accounts) {
  const owner = accounts[0];
  const newOwner = accounts[1];
  const admin = accounts[2];

  let candidateToken;
  let totalSupplyPolicy;
  let ownerNotChangedPolicy;

  beforeEach(async function () {
    candidateToken = await CandidateToken.new();
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
    let applicantA = accounts[9];
    let applicantB = accounts[8];
    let applicantC = accounts[7];
    let listingA = applicantA;
    let listingB = applicantB;
    let listingC = applicantC;
    let minDeposit;

    beforeEach(async function () {
      quantstampToken = await QuantstampToken.new(admin, {from : owner});
      voting = await Voting.new();
      await voting.init(quantstampToken.address);
      expertTCR = await Registry.new();
      quantstampParameterizer = await QuantstampParameterizer.new();
      await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
      await expertTCR.init(quantstampToken.address, voting.address, quantstampParameterizer.address, 'QSPtest');
      tcrOpinionPolicy = await TCROpinionPolicy.new(2, candidateToken.address, expertTCR.address);

      minDeposit = TCRUtil.minDep.toNumber();
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

    it("should not be violated by the TCR policy before experts vote", async function() {
      assert.isFalse(await tcrOpinionPolicy.isViolated(candidateToken.address));
    });

    it("should fail  when the TCR policy is checked with a non-TCR address as an argument for the policy", async function() {
      Util.assertTxFail(await tcrOpinionPolicy.isViolated(owner));
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
      await tcrOpinionPolicy.vote(true, {from: applicantA});
      await tcrOpinionPolicy.vote(false, {from: applicantB});
      await tcrOpinionPolicy.vote(true, {from: applicantB});
      assert.isTrue(await tcrOpinionPolicy.isViolated(candidateToken.address));
    });
  });
});
