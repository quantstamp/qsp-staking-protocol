const QSPb = artifacts.require('QSPb');

contract('QSPb', function(){
  
  beforeEach(async function () {
    await QSPb.deployed();
  });

  it("should never fail", async function() {
    assert.true;
  }); 
});
