const Util = require("./util.js");
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const TrivialBackdoorPolicy = artifacts.require('TrivialBackdoorPolicy');
const TCRContainsEntryPolicy = artifacts.require('TCRContainsEntryPolicy');
const DemocraticViolationPolicy = artifacts.require('DemocraticViolationPolicy');
const TrustedOpinionPolicy = artifacts.require('TrustedOpinionPolicy');
const CandidateToken = artifacts.require('CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('TotalSupplyNotExceededPolicy');
const OwnerNotChangedPolicy = artifacts.require('OwnerNotChangedPolicy');
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
});
