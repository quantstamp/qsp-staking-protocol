const CandidateContract = artifacts.require('CandidateContract');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');

contract('CandidateContract', function(accounts) {
  const candidateContractAddress = accounts[0];
  const contractPolicyAddress = accounts[1];

  it("should violate policy", async function() {
    var candidate = await CandidateContract.deployed();
    var policy = await ZeroBalancePolicy.deployed();

    assert(await policy.isViolated(candidateContractAddress));
  });
});