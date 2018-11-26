const Util = require("./util.js");
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
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
const Registry = artifacts.require('test/Registry');
const TCRUtil = require('./tcrutils.js');

contract('CandidateContract', function(accounts) {

  //Necessary for TCR policy test
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

  beforeEach(async function () {
    quantstampToken = await QuantstampToken.deployed();
    candidateContract = await CandidateContract.deployed();
    zeroBalancePolicy = await ZeroBalancePolicy.deployed();
    trivialBackdoorPolicy = await TrivialBackdoorPolicy.deployed();
    tcr = await Registry.deployed();
    tcrContainsEntryPolicy = await TCRContainsEntryPolicy.new(listing);
    democraticPolicy = await DemocraticViolationPolicy.deployed();
    trustedOpinionPolicy = await TrustedOpinionPolicy.new(2, candidateContract.address, owner);
  });

  it("should not initially violate the zero-balance policy", async function() {
    assert.equal(await zeroBalancePolicy.isViolated(candidateContract.address), false);
  });

  it("should violate the zero-balance policy after the balance is withdrawn", async function() {
    await candidateContract.withdraw(await candidateContract.balance.call());
    assert.equal(await zeroBalancePolicy.isViolated(candidateContract.address), true);
  });

  it("should throw an error", async function() {
    Util.assertTxFail(zeroBalancePolicy.isViolated(accounts[0]));
  });

  it("should not initially violate the trivial-backdoor policy", async function() {
    assert.equal(await trivialBackdoorPolicy.isViolated(candidateContract.address), false);
  });

  it("should violate the trivial-backdoor policy after that policy status is updated", async function() {
    await trivialBackdoorPolicy.updateStatus(true);
    assert.equal(await trivialBackdoorPolicy.isViolated(candidateContract.address), true);
  });

  it("should not matter when the TCR entry policy is checked with a non-TCR address", async function() {
    Util.assertTxFail(tcrContainsEntryPolicy.isViolated(Util.ZERO_ADDRESS));
  });

  it("should initially violate the TCR entry policy (entry missing)", async function() {
    assert.equal(await tcrContainsEntryPolicy.isViolated(tcr.address), true);
  });

  it("should no longer violate the TCR entry policy once the TCR is updated (entry is whitelisted)", async function() {
    const voting = await Voting.deployed();
    await voting.init(QuantstampToken.address);

    const quantstampParameterizer = await QuantstampParameterizer.deployed();
    await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);
    await tcr.init(QuantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');

    const applicant = listing;
    const minDeposit = TCRUtil.minDep;

    await quantstampToken.enableTransfer({from : owner});
    // transfer the minimum number of tokens to the requestor
    await quantstampToken.transfer(applicant, minDeposit, {from : owner});

    // allow the registry contract use up to minDeposit for audits
    await quantstampToken.approve(tcr.address, Util.toQsp(minDeposit), {from : applicant});

    // allow the voting contract use up to minDeposit for audits
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicant});

    await TCRUtil.addToWhitelist(listing, minDeposit, applicant, tcr);

    assert.equal(await tcrContainsEntryPolicy.isViolated(tcr.address), false);
  });

  it("should not matter when the democratic opinion policy is checked with the wrong address", async function() {
    Util.assertTxFail(democraticPolicy.isViolated(Util.ZERO_ADDRESS));
  });

  it("should not initially violate the democratic policy", async function() {
    assert.equal(await democraticPolicy.isViolated(candidateContract.address), false);
  });

  it("should not have its status voted on by the same address more than once", async function() {
    await democraticPolicy.vote(1, {from: accounts[1]});
    Util.assertTxFail(democraticPolicy.vote(1, {from: accounts[1]}));
  });

  it("should violate the democratic policy after some people vote for violation", async function() {
    await democraticPolicy.vote(1, {from: accounts[2]});
    await democraticPolicy.vote(1, {from: accounts[3]});
    assert.equal(await democraticPolicy.isViolated(candidateContract.address), true);
  });

  it("should not matter when the trusted opinion policy is checked with the wrong address", async function() {
    Util.assertTxFail(trustedOpinionPolicy.isViolated(Util.ZERO_ADDRESS));
  });

  it("should not initially violate the trusted opinion policy", async function() {
    assert.equal(await trustedOpinionPolicy.isViolated(candidateContract.address), false);
  });

  it("should violate the trusted policy after some trusted people vote for violation", async function() {
    await trustedOpinionPolicy.giveRightToVote(accounts[2], {from: accounts[0]});
    await trustedOpinionPolicy.giveRightToVote(accounts[3], {from: accounts[0]});
    await trustedOpinionPolicy.vote(1, {from: accounts[2]});
    await trustedOpinionPolicy.vote(1, {from: accounts[3]});
    assert.equal(await trustedOpinionPolicy.isViolated(candidateContract.address), true);
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

  it("should not matter when the total supply policy is checked with a non-token address", async function() {
    Util.assertTxFail(totalSupplyPolicy.isViolated(owner));
  });

  it("should not initially violate minted tokens policy (no tokens minted yet)", async function() {
    assert.equal(await totalSupplyPolicy.isViolated(candidateToken.address), false);
  });

  it("should violate the minted tokens policy when too many (1) additional tokens are minted", async function() {
    await candidateToken.mint(owner, 1);

    assert.equal(await totalSupplyPolicy.isViolated(candidateToken.address), true);
  });

  it("should not violate the OwnerNotChangedPolicy if the owner remains the same", async function() {
    assert.equal(await ownerNotChangedPolicy.isViolated(candidateToken.address), false);
  });

  it("should throw an exception on OwnerNotChangedPolicy if the address is not compatible with Candidate Token", async function() {
    Util.assertTxFail(ownerNotChangedPolicy.isViolated(totalSupplyPolicy.address));
  });

  it("should violate the OwnerNotChangedPolicy if the owner has changed", async function() {
    candidateToken.transferOwnership(newOwner);
    assert.equal(await ownerNotChangedPolicy.isViolated(candidateToken.address), true);
  });

  it("should not matter when the TCR policy is checked with a non-TCR address", async function() {
    const expertTCR = await Registry.deployed();
    const tcrOpinionPolicy = await TCROpinionPolicy.new(2,candidateToken.address,expertTCR.address);
    Util.assertTxFail(tcrOpinionPolicy.isViolated(owner));
  });

  it("should not be violted by the TCR policy before experts vote", async function() {
    const expertTCR = await Registry.deployed();
    const tcrOpinionPolicy = await TCROpinionPolicy.new(2,candidateToken.address,expertTCR.address);
    assert.equal(await tcrOpinionPolicy.isViolated(candidateToken.address), false);
  });

  it("should be violted by the TCR policy after experts vote", async function() {
    const voting = await Voting.deployed();
    await voting.init(QuantstampToken.address);

    const expertTCR = await Registry.deployed();

    const quantstampToken = await QuantstampToken.deployed();
    const quantstampParameterizer = await QuantstampParameterizer.deployed();
    await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);
    await expertTCR.init(QuantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');

    const applicantA = accounts[9];
    const listingA = applicantA;
    const minDeposit = TCRUtil.minDep;

    await quantstampToken.enableTransfer({from : owner});
    // transfer the minimum number of tokens to the requestor
    await quantstampToken.transfer(applicantA, minDeposit, {from : owner});

    // allow the registry contract use up to minDeposit for audits
    await quantstampToken.approve(expertTCR.address, Util.toQsp(minDeposit), {from : applicantA});

    // allow the voting contract use up to minDeposit for audits
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicantA});

    await TCRUtil.addToWhitelist(listingA, minDeposit, applicantA, expertTCR);

    const applicantB = accounts[8];
    const listingB = applicantB;

    await quantstampToken.enableTransfer({from : owner});
    // transfer the minimum number of tokens to the requestor
    await quantstampToken.transfer(applicantB, minDeposit, {from : owner});

    // allow the registry contract use up to minDeposit for audits
    await quantstampToken.approve(expertTCR.address, Util.toQsp(minDeposit), {from : applicantB});

    // allow the voting contract use up to minDeposit for audits
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicantB});

    await TCRUtil.addToWhitelist(listingB, minDeposit, applicantB, expertTCR);

    const tcrOpinionPolicy = await TCROpinionPolicy.new(2,candidateToken.address,expertTCR.address);

    await tcrOpinionPolicy.vote(1, {from: applicantA});
    await tcrOpinionPolicy.vote(1, {from: applicantB});

    assert.equal(await tcrOpinionPolicy.isViolated(candidateToken.address), true);
  });

  it("should not be voted on by the same TCR expert", async function() {
    const voting = await Voting.deployed();
    //Note that voting has `init` called in the previous test.

    const expertTCR = await Registry.new();

    const quantstampToken = await QuantstampToken.deployed();
    const quantstampParameterizer = await QuantstampParameterizer.deployed();
    //Note that quantstampParameterizer has `init` called in the previous test.
    await expertTCR.init(QuantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');

    const applicantC = accounts[7];
    const listingC = applicantC;
    const minDeposit = TCRUtil.minDep;

    //Note that quantstampToken.enableTransfer({from : owner}); is called in the previous test.
    // transfer the minimum number of tokens to the requestor
    await quantstampToken.transfer(applicantC, minDeposit, {from : owner});

    // allow the registry contract use up to minDeposit for audits
    await quantstampToken.approve(expertTCR.address, Util.toQsp(minDeposit), {from : applicantC});

    // allow the voting contract use up to minDeposit for audits
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicantC});

    await TCRUtil.addToWhitelist(listingC, minDeposit, applicantC, expertTCR);

    const tcrOpinionPolicy = await TCROpinionPolicy.new(2,candidateToken.address,expertTCR.address);

    await tcrOpinionPolicy.vote(1, {from: applicantC});
    Util.assertTxFail(tcrOpinionPolicy.vote(1, {from: applicantC}));
  });

});
