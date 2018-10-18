const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');

contract('CandidateContract', function(accounts) {
  const candidateContractAddress = accounts[0];
  
  it("should violate policy", async function() {
    var policy = await ZeroBalancePolicy.deployed();

    assert(await policy.isViolated(candidateContractAddress));
  });
});