const QuantstampStaking = artifacts.require('QuantstampStaking');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"))

contract('QuantstampStaking', function(accounts){
    const candidateContract = accounts[0];
    const contractPolicy = accounts[1];
    const poolOwner = accounts[2];

    it("should never fail", async function() {
        assert.true;
    });

    it("should add a pool", async function() {
        qspb = await QuantstampStaking.deployed();
        assert.equal(await qspb.balance.call(), 0);
        await qspb.createPool(candidateContract, contractPolicy, 10, 1, 3, 5, 15, 10000, 100, "URL", 
            {from: poolOwner, value: web3.toWei('3', 'wei')});
        assert.equal(await qspb.getPoolsLength.call(), 1);
        assert.equal(await qspb.getPoolCandidateContract(0), candidateContract);
        assert.equal(await qspb.getPoolContractPolicy(0), contractPolicy);
        assert.equal(await qspb.getPoolOwner(0), poolOwner);
        assert.equal(await qspb.getPoolMaxPayoutQspWei(0), 10);
        assert.equal(await qspb.getPoolMinStakeQspWei(0), 1);
        assert.equal(await qspb.getPoolDepositQspWei(0), web3.toWei('3', 'wei'));
        assert.equal(await qspb.getPoolBonusExpertFactor(0), 3);
        assert.equal(await qspb.getPoolBonusFirstExpertFactor(0), 5);
        assert.equal(await qspb.getPoolPayPeriodInBlocks(0), 15);
        assert.equal(await qspb.getPoolMinStakeTimeInBlocks(0), 10000);
        assert.equal(await qspb.getPoolTimeoutInBlocks(0), 100);
        assert.equal(await qspb.getPoolTimeOfInitInBlocks(0), web3.eth.getBlock("latest").number);
        assert.equal(await qspb.getPoolUrlOfAuditReport(0), "URL");
    }); 
});
