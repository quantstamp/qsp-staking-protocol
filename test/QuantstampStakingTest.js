const QuantstampStaking = artifacts.require('QuantstampStaking');
const Registry = artifacts.require('Registry');

contract('QuantstampStaking', function(accounts){

  beforeEach(async function () {
    quantstampStaking = await QuantstampStaking.deployed();
    registry = await Registry.deployed();
  });

  it("should have the right registry address", async function() {
    assert.equal(await quantstampStaking.getStakingRegistry(), registry.address);
  });
});
