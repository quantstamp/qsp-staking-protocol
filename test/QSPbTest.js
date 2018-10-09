const QSPb = artifacts.require('QSPb');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(ganache.provider());

contract('QSPb', function(accounts){
    const candidateContract = accounts[0];
    const contractPolicy = accounts[1];
    const poolOwner = accounts[2];

    it("should never fail", async function() {
        assert.true;
    });

    it("should add a pool", async function() {
        qspb = await QSPb.deployed();
        assert.equal(await qspb.balance.call(), 0);
        await qspb.createPool(candidateContract, contractPolicy, 10, 1, 3, 5, 15, 10000, 100, true, 
            {from: poolOwner, value: web3.toWei('3', 'ether')});
        assert.equal(await qspb.getPoolsLength.call(), 1);
        assert.equal(await qspb.getPoolCandidateContract(0), candidateContract);
        assert.equal(await qspb.getPoolContractPolicy(0), contractPolicy);
        assert.equal(await qspb.getPoolOwner(0), poolOwner);
        assert.equal(await qspb.getPoolMaxPayout(0), 10);
        assert.equal(await qspb.getPoolMinStake(0), 1);
        assert.equal(await qspb.getPoolDeposit(0), web3.toWei('3', 'ether'));
        assert.equal(await qspb.getPoolBonusExpert(0), 3);
        assert.equal(await qspb.getPoolBonusFirstExpert(0), 5);
        assert.equal(await qspb.getPoolPayPeriod(0), 15);
        assert.equal(await qspb.getPoolMinStakeTime(0), 10000);
        assert.equal(await qspb.getPoolTimeout(0), 100);
        assert.equal(await qspb.getPoolTimeOfInit(0), web3.eth.getBlockNumber(console.log));
        assert.equal(await qspb.getPoolUrlOfAuditReport(0), "");
    }); 
});
