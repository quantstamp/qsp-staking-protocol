const QSPb = artifacts.require('QSPb');
const Registry = artifacts.require('Registry');

contract('QSPb', function(accounts){

  beforeEach(async function () {
    qspb = await QSPb.deployed();
    registry = await Registry.deployed();
  });

  it("should have the right registry address", async function() {
    assert.equal(await qspb.getStakingRegistry(), registry.address);
  });
});
