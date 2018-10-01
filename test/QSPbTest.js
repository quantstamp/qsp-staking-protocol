const QSPb = artifacts.require('QSPb');

contract('QSPb', function(accounts){
  const owner = accounts[0];
  const stakeholder = accounts[1];
  const staker = accounts[2];
  const candidateContract = accounts[3];

  beforeEach(async function () {
    qspb = await QSPb.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    
    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
  });

  if ("submits contract", async function() {
    qspb.submitContract(candidateContract, 10, 1, 3, 5, 15, 10000, 100);
    assert(qspb.pools.length > 0);
  }); 
});
