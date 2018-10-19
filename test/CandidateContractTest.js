const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');

contract('CandidateContract', function(accounts) {
  let candidateContract;
  let policy;

  beforeEach(async function () {
    candidateContract = await CandidateContract.deployed();
    policy = await ZeroBalancePolicy.deployed();
  });

  it("should not violate policy", async function() {
    assert.equal(await policy.isViolated(candidateContract.address), false);
  });

  it("should violate policy", async function() {
    await candidateContract.withdraw(await candidateContract.balance.call());
    assert(await policy.isViolated(candidateContract.address));
  });  

  it("should throw an error", async function() {
    assert.throws(await policy.isViolated(accounts[0]), Error);
  });
});
