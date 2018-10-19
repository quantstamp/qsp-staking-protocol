const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));
const { ZERO_ADDRESS } = require('./constants.js');
const Util = require('./util.js');
const TCRUtil = require('./tcrutils.js');

contract('QuantstampStaking', function(accounts) {
  const owner = accounts[0];
  const candidateContract = accounts[1];
  const contractPolicy = accounts[2];
  const poolOwner = accounts[3];
  const poolOwnerBudget = Util.toQsp(100000);
  const PoolState = Object.freeze({
    None : 0,
    Initialized : 1,
    NotViolatedUnderfunded : 2,
    ViolatedUnderfunded : 3,
    NotViolatedFunded : 4,
    ViolatedFunded : 5,
    Cancelled: 6
  });

  let qspb;
  let quantstampToken;
  let quantstampRegistry;

  it("should add a pool", async function() {
    qspb = await QuantstampStaking.deployed();
    quantstampToken = await QuantstampToken.deployed();
    quantstampRegistry = await QuantstampStakingRegistry.deployed();
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstampToken.approve(qspb.address, Util.toQsp(1000), {from : poolOwner});
    // balance should be 0 in the beginning
    assert.equal(await qspb.balanceQspWei.call(), 0);
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
    assert.equal(await qspb.getPoolMaxPayoutQspWei(0), maxPayableQspWei);
    assert.equal(await qspb.getPoolMinStakeQspWei(0), minStakeQspWei);
    assert.equal(await qspb.getPoolDepositQspWei(0), depositQspWei);
    assert.equal(await qspb.getPoolBonusExpertFactor(0), bonusExpertFactor);
    assert.equal(await qspb.getPoolBonusFirstExpertFactor(0), bonusFirstExpertFactor);
    assert.equal(await qspb.getPoolPayPeriodInBlocks(0), payPeriodInBlocks);
    assert.equal(await qspb.getPoolMinStakeTimeInBlocks(0), minStakeTimeInBlocks);
    assert.equal(await qspb.getPoolTimeoutInBlocks(0), timeoutInBlocks);
    assert.equal(await qspb.getPoolTimeOfInitInBlocks(0), web3.eth.getBlock("latest").number);
    assert.equal(await qspb.getPoolUrlOfAuditReport(0), urlOfAuditReport);
    assert.equal(await qspb.getPoolState(0), PoolState.Initialized);
    // balance should be increased
    assert.equal(await qspb.balanceQspWei.call(), depositQspWei);
  });

  it("should have an owner", async function() {
    assert.equal(await qspb.owner(), owner);
  });

  it("should have the right token address", async function() {
    assert.equal(await qspb.getToken(), quantstampToken.address);
  });

  it("should have the right registry address", async function() {
    assert.equal(await qspb.getStakingRegistry(), quantstampRegistry.address);
  });

  it("should fail if a TCR with address zero is passed into the constructor", async function () {
    Util.assertTxFail(QuantstampStaking.new(quantstampToken.address, ZERO_ADDRESS));
  });

  describe("isExpert", async function() {

    it("should return true if the expert is on the list", async function() {
      // Set up the PLCR voting contract used by the TCR; should use QSP tokens
      const voting = await Voting.deployed();
      await voting.init(QuantstampToken.address);

      // Make sure a TCR parameterizer is deployed using QSP tokens
      const quantstampParameterizer = await QuantstampParameterizer.deployed();
      await quantstampParameterizer.init(QuantstampToken.address, voting.address, TCRUtil.parameters);

      // Ensure the TCR uses the right token, voting, and parameterize contracts
      await quantstampRegistry.init(QuantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');

      // Pick some account to add themselves to the TCR.
      const applicant = accounts[4];
      const listing = applicant;          //Listing stores the address of applicant
      const minDeposit = TCRUtil.minDep;

      // Enable the QSP token owner to give our test applicant some QSP
      await quantstampToken.enableTransfer({from : owner});

      // transfer the minimum number of tokens to the requestor
      await quantstampToken.transfer(applicant, minDeposit, {from : owner});

      // allow the registry contract use up to minDeposit for audits
      await quantstampToken.approve(quantstampRegistry.address, Util.toQsp(minDeposit), {from : applicant});

      // allow the voting contract use up to minDeposit for audits
      await quantstampToken.approve(voting.address,  Util.toQsp(minDeposit), {from : applicant});

      // Put our applicant on the list. This includes waiting for the application period to end
      // (i.e. they apply and are not challenged, so they get on the list)
      await TCRUtil.addToWhitelist(listing, minDeposit, applicant, quantstampRegistry);

      // Make sure the Staking contract can determine that the applicant is in fact on the list
      assert.strictEqual(await qspb.isExpert(applicant),true,'Applicant was not set as expert');
    });

    it("should return false if the expert is not on the list", async function() {
      // Make sure an address that isn't on the TCR isn't an expert according to the Staking contracts
      assert.strictEqual(await qspb.isExpert(ZERO_ADDRESS),false,'Zero address was apparently an expert');
    });
  });
});
