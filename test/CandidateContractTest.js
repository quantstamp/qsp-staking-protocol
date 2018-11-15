const Util = require("./util.js");
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const TrivialBackdoorPolicy = artifacts.require('TrivialBackdoorPolicy');

contract('CandidateContract', function(accounts) {
  let candidateContract;
  let zeroBalancePolicy;
  let trivialBackdoorPolicy;

  beforeEach(async function () {
    candidateContract = await CandidateContract.deployed();
    zeroBalancePolicy = await ZeroBalancePolicy.deployed();
    trivialBackdoorPolicy = await TrivialBackdoorPolicy.deployed();
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
});
