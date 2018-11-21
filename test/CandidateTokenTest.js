const Util = require("./util.js");
const CandidateToken = artifacts.require('CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('TotalSupplyNotExceededPolicy');

contract('CandidateToken', function(accounts) {
  const owner = accounts[0];

  let candidateToken;
  let totalSupplyPolicy;

  beforeEach(async function () {
    candidateToken = await CandidateToken.deployed();
    totalSupplyPolicy = await TotalSupplyNotExceededPolicy.deployed();
  });

  it("should not matter when the total supply policy is checked with a non-token address", async function() {
    Util.assertTxFail(totalSupplyPolicy.isViolated(owner));
  });

  it("should not initially violate the at most 2*10**18 minted tokens policy", async function() {
    assert.equal(await totalSupplyPolicy.isViolated(candidateToken.address), false);
  });

  it("should violate the at most 2*10**18 minted tokens policy when too many (1) additional tokens are minted", async function() {
    await candidateToken.mintToken(owner, 1);

    assert.equal(await totalSupplyPolicy.isViolated(candidateToken.address), true);
  });

});
