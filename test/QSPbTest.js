const QSPb = artifacts.require('QSPb');

contract('QSPb', function(accounts){
  
  beforeEach(async function () {
    qspb = await QSPb.deployed();
  });

  it("should never fail", async function() {
    assert.true;
  }); 
});
