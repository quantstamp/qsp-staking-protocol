const QSPb = artifacts.require('QSPb');

contract('QSPb', function(accounts){
    const candidateContract = accounts[0];
    const contractPolicy = accounts[1];

    beforeEach(async function () {
        qspb = await QSPb.deployed();
    });

    it("should never fail", async function() {
        assert.true;
    });

    it("should add a pool", async function() {
        assert.equal(await qspb.balance.call(), 0);
        await qspb.createPool(candidateContract, contractPolicy, 10, 1, 3, 5, 15, 10000, 100);
        assert.equal(await qspb.getPoolsLength.call(), 1);
    }); 
});
