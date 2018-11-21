const CandidateToken = artifacts.require('CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('TotalSupplyNotExceededPolicy');
const OwnerNotChangedPolicy = artifacts.require('OwnerNotChangedPolicy');

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

  it("should not initially violate the at most 2*10**18 minted tokens policy", async function() {
    assert.equal(await totalSupplyPolicy.isViolated(candidateToken.address), false);
  });

  it("should violate the at most 2*10**18 minted tokens policy when too many (1) additional tokens are minted", async function() {
    await candidateToken.mintToken(owner, 1);

    assert.equal(await totalSupplyPolicy.isViolated(candidateToken.address), true);
  });

  it("should not violate the OwnerNotChangedPolicy if the owner remains the same", async function() {
    assert.equal(await ownerNotChangedPolicy.isViolated(candidateToken.address), false);
  });

  it("should violate the OwnerNotChangedPolicy if the owner has changed", async function() {
    candidateToken.transferOwnership(newOwner);
    assert.equal(await ownerNotChangedPolicy.isViolated(candidateToken.address), true);
  });

});
