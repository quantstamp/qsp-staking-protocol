const Util = require("./util.js");
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const TrivialBackdoorPolicy = artifacts.require('TrivialBackdoorPolicy');
const TCRContainsEntryPolicy = artifacts.require('TCRContainsEntryPolicy');
const Registry = artifacts.require('test/Registry');
const TCRUtil = require('./tcrutils.js');

contract('CandidateContract', function(accounts) {

  //Necessary for TCR policy test
  const owner = accounts[0];
  let quantstampToken;

  let candidateContract;
  let zeroBalancePolicy;
  let trivialBackdoorPolicy;
  let tcr;
  let tcrContainsEntryPolicy;

  beforeEach(async function () {
    quantstampToken = await QuantstampToken.deployed();
    candidateContract = await CandidateContract.deployed();
    zeroBalancePolicy = await ZeroBalancePolicy.deployed();
    trivialBackdoorPolicy = await TrivialBackdoorPolicy.deployed();
    tcr = await Registry.deployed();
    tcrContainsEntryPolicy = await TCRContainsEntryPolicy.deployed();
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

  it("should initially violate the TCR entry policy", async function() {
    assert.equal(await tcrContainsEntryPolicy.isViolated(tcr.address), false);
  });

  it("should no longer violate the TCR entry policy once the TCR is updated", async function() {
    const voting = await Voting.deployed();
    await voting.init(QuantstampToken.address);

    const quantstampParameterizer = await QuantstampParameterizer.deployed();
    await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);
    await tcr.init(QuantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');

    const applicant = accounts[9];
    const listing = applicant;
    const minDeposit = TCRUtil.minDep;

    await quantstampToken.enableTransfer({from : owner});
    // transfer the minimum number of tokens to the requestor
    await quantstampToken.transfer(applicant, minDeposit, {from : owner});

    // allow the registry contract use up to minDeposit for audits
    await quantstampToken.approve(tcr.address, Util.toQsp(minDeposit), {from : applicant});

    // allow the voting contract use up to minDeposit for audits
    await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicant});

    await TCRUtil.addToWhitelist(listing, minDeposit, applicant, tcr);

    await tcrContainsEntryPolicy.specifyEntry(listing);
    assert.equal(await tcrContainsEntryPolicy.isViolated(tcr.address), true);
  });
  
});
