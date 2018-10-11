const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"))
const Util = require("./util.js");

contract('QuantstampStaking', function(accounts){
    const owner = accounts[0]
    const candidateContract = accounts[1];
    const contractPolicy = accounts[2];
    const poolOwner = accounts[3];
    const poolOwnerBudget = Util.toQsp(100000);

    let qspb;
    let quantstamp_token;

    it("should never fail", async function() {
        assert.true;
    });

    it("should add a pool", async function() {
        qspb = await QuantstampStaking.deployed();
        quantstamp_token = await QuantstampToken.deployed();
        // enable transfers before any payments are allowed
        await quantstamp_token.enableTransfer({from : owner});
        // transfer 100,000 QSP tokens to the requestor
        await quantstamp_token.transfer(poolOwner, poolOwnerBudget, {from : owner});
        // allow the audit contract use up to 65QSP for audits
        await quantstamp_token.approve(qspb.address, Util.toQsp(1000), {from : poolOwner});
        // balance should be 0 in the beginning
        assert.equal(await qspb.balanceQspWei.call(), 0);
	// vars needed for creating pool
	var maxPayableQspWei = 10;
	var minStakeQspWei = 1;
	var depositQspWei = Util.toQsp(100);
	var bonusExpertFactor = 3;
	var bonusFirstExpertFactor = 5;
	var payPeriodInBlocks = 15;
	var minStakeTimeInBlocks = 10000;
	var timeoutInBlocks = 100;
	var urlOfAuditReport = "URL";
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
