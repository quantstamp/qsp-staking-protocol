const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"))
const Util = require("./util.js");
const utils = require('../migrations/utils.js');

contract('QuantstampStaking', function(accounts, network) {
    const owner = accounts[0]
    const candidateContract = accounts[1];
    const contractPolicy = accounts[2];
    const poolOwner = accounts[3];
    const poolOwnerBudget = Util.toQsp(100000);

    let qspb;
    let quantstampToken;

    it("should add a pool", async function() {
        qspb = await QuantstampStaking.deployed();
        quantstampToken = await QuantstampToken.deployed();
        // enable transfers before any payments are allowed
        await quantstampToken.enableTransfer({from : owner});
        // transfer 100,000 QSP tokens to the requestor
        await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
        // allow the audit contract use up to 65QSP for audits
        await quantstampToken.approve(qspb.address, Util.toQsp(1000), {from : poolOwner});
        // balance should be 0 in the beginning
        assert.equal(await qspb.balanceQspWei.call(), 0);
        // check that the token is correct
        assert.equal(await qspb.getToken(), quantstampToken.address);
        // vars needed for creating pool
        const maxPayableQspWei = 10;
        const minStakeQspWei = 1;
        const depositQspWei = Util.toQsp(100);
        const bonusExpertFactor = 3;
        const bonusFirstExpertFactor = 5;
        const payPeriodInBlocks = 15;
        const minStakeTimeInBlocks = 10000;
        const timeoutInBlocks = 100;
        const urlOfAuditReport = "URL";
        // create pool
        await qspb.createPool(candidateContract, contractPolicy, maxPayableQspWei, minStakeQspWei, 
            depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks, 
            minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, {from: poolOwner});
        // check all pool properties
        assert.equal(await qspb.getPoolsLength.call(), 1);
        assert.equal(await qspb.getPoolCandidateContract(0), candidateContract);
        assert.equal(await qspb.getPoolContractPolicy(0), contractPolicy);
        assert.equal(await qspb.getPoolOwner(0), poolOwner);
        assert.equal(await qspb.getPoolMaxPayoutQspWei(0), 10);
        assert.equal(await qspb.getPoolMinStakeQspWei(0), 1);
        assert.equal(await qspb.getPoolDepositQspWei(0), Util.toQsp(100));
        assert.equal(await qspb.getPoolBonusExpertFactor(0), 3);
        assert.equal(await qspb.getPoolBonusFirstExpertFactor(0), 5);
        assert.equal(await qspb.getPoolPayPeriodInBlocks(0), 15);
        assert.equal(await qspb.getPoolMinStakeTimeInBlocks(0), 10000);
        assert.equal(await qspb.getPoolTimeoutInBlocks(0), 100);
        assert.equal(await qspb.getPoolTimeOfInitInBlocks(0), web3.eth.getBlock("latest").number);
        assert.equal(await qspb.getPoolUrlOfAuditReport(0), "URL");
        // balance should be increased
        assert.equal(await qspb.balanceQspWei.call(), depositQspWei);	
    }); 

    it("should have an owner", async function() {
        assert.equal(await qspb.owner(), owner);
    });
});