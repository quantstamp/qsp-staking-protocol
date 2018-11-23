const QuantstampStaking = artifacts.require('QuantstampStaking');
const ZeroBalancePolicy = artifacts.require('policies/ZeroBalancePolicy');
const OwnerNotChangedPolicy = artifacts.require('policies/OwnerNotChangedPolicy')
const CandidateContract = artifacts.require('CandidateContract');
const CandidateToken = artifacts.require('CandidateToken');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('Registry');
const QuantstampParameterizer = artifacts.require('Parameterizer');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const TCRUtil = require('./tcrutils.js');
const Util = require("./util.js");
const BigNumber = require('bignumber.js');

contract('QuantstampStaking: staker requests payout', function(accounts) {
  const PoolState = Object.freeze({
    None : 0,
    Initialized : 1,
    NotViolatedUnderfunded : 2,
    ViolatedUnderfunded : 3,
    NotViolatedFunded : 4,
    ViolatedFunded : 5,
    Cancelled: 6
  });

  async function instantiatePool(qspb, poolParams) {
    await qspb.createPool(poolParams.candidateContract.address, 
        poolParams.contractPolicy.address, 
        poolParams.maxPayoutQspWei, 
        poolParams.minStakeQspWei,
        poolParams.depositQspWei, 
        poolParams.bonusExpertFactor, 
        poolParams.bonusFirstExpertFactor, 
        poolParams.payPeriodInBlocks,
        poolParams.minStakeTimeInBlocks, 
        poolParams.timeoutInBlocks, 
        poolParams.urlOfAuditReport, 
        {from: poolParams.owner});
  };

  async function arePoolParametersAsExpected(qspb, poolParams) {
    try {
        assert.equal(await qspb.getPoolCandidateContract(poolParams.index), poolParams.candidateContract.address, "candidateContract not equal");
        assert.equal(await qspb.getPoolContractPolicy(poolParams.index), poolParams.contractPolicy.address, "contractPolicy not equal");
        assert.equal(await qspb.getPoolOwner(poolParams.index), poolParams.owner, "pool owner not equal");
        assert.isTrue(poolParams.maxPayoutQspWei.eq(await qspb.getPoolMaxPayoutQspWei(poolParams.index)), "maxPayoutQspWei not equal");
        assert.isTrue(poolParams.minStakeQspWei.eq(await qspb.getPoolMinStakeQspWei(poolParams.index)), "minStakeQspWei not equal");
        assert.isTrue(poolParams.depositQspWei.eq(await qspb.getPoolDepositQspWei(poolParams.index)), "depositQspWei not equal");
        assert.isTrue(poolParams.bonusExpertFactor.eq(await qspb.getPoolBonusExpertFactor(poolParams.index)), "bonusExpertFactor not equal");
        assert.isTrue(poolParams.bonusFirstExpertFactor.eq(await qspb.getPoolBonusFirstExpertFactor(poolParams.index)), "bonusFirstExpertFactor not equal");
        assert.equal(await qspb.getPoolFirstExpertStaker(poolParams.index), poolParams.firstExpertStaker, "firstExpertStaker not equal");
        assert.isTrue(poolParams.payPeriodInBlocks.eq(await qspb.getPoolPayPeriodInBlocks(poolParams.index)), "payPeriodInBlocks not equal");
        assert.isTrue(poolParams.minStakeTimeInBlocks.eq(await qspb.getPoolMinStakeTimeInBlocks(poolParams.index)), "minStakeTimeInBlocks not equal");
        assert.isTrue(poolParams.timeoutInBlocks.eq(await qspb.getPoolTimeoutInBlocks(poolParams.index)), "timeoutInBlocks not equal");
        assert.isTrue(poolParams.timeOfStateInBlocks.eq(await qspb.getPoolTimeOfStateInBlocks(poolParams.index)), "timeOfStateInBlocks not equal");
        assert.equal(await qspb.getPoolUrlOfAuditReport(poolParams.index), poolParams.urlOfAuditReport, "urlOfAuditReport not equal");
        assert.equal(await qspb.getPoolState(poolParams.index), poolParams.state, "poolState not equal");
        assert.isTrue(poolParams.totalStakeQspWei.eq(await qspb.getPoolTotalStakeQspWei(poolParams.index)), "totalStakeQspWei not equal");
        assert.isTrue(poolParams.poolSizeQspWei.eq(await qspb.getPoolSizeQspWei(poolParams.index)), "poolSizeQspWei not equal " + poolParams.poolSizeQspWei.toString() + " != " + await qspb.getPoolSizeQspWei(poolParams.index));
        assert.isTrue(poolParams.stakeCount.eq(await qspb.getPoolStakeCount(poolParams.index)), "stakeCount not equal");
    } catch (err) {
        return err.message;
    }
    return true;
  };

  let qspb;
  let quantstampToken;
  let quantstampRegistry;
  let quantstampParameterizer;
  let voting;
  let currentPoolNumber;
  let balanceOfQspb = new BigNumber(0);
  let staker1StakeBlock;
  let staker2StakeBlock;
  let staker3StakeBlock;
  let staker4StakeBlock;
  let staker5StakeBlock;

  const minDeposit = new BigNumber(Util.toQsp(TCRUtil.minDep));
  const oneHundredQsp = new BigNumber(Util.toQsp(100));
  const candidateContractBalance = oneHundredQsp;

  const owner = accounts[0];
  const stakeholder1 = accounts[1]; // orange pool & white pool
  const stakeholder2 = accounts[2]; // gray pool
  const stakeholder3 = accounts[3]; // purple pool
  const stakeholder4 = accounts[4]; // blue pool
  const staker1 = accounts[5]; // expert staker
  const staker2 = accounts[6]; // expert staker
  const staker3 = accounts[7]; // non-expert staker
  const staker4 = accounts[8]; // non-expert staker
  const staker5 = accounts[9]; // expert staker

  const stakeholder1Budget = new BigNumber(Util.toQsp(10000));
  const stakeholder2Budget = new BigNumber(Util.toQsp(50000));
  const stakeholder3Budget = new BigNumber(Util.toQsp(10000));
  const stakeholder4Budget = new BigNumber(Util.toQsp(10000));
  const staker1Budget = new BigNumber(Util.toQsp(100 + 100)).plus(minDeposit);
  const staker2Budget = new BigNumber(Util.toQsp(400 + 100)).plus(minDeposit);
  const staker3Budget = new BigNumber(Util.toQsp(300));
  const staker4Budget = new BigNumber(Util.toQsp(500 + 100));
  const staker5Budget = new BigNumber(Util.toQsp(50 + 100 + 200 + 500)).plus(minDeposit);

  // Orange Pool params
  let orangePoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder1,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(100)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(400)),
    'depositQspWei' : new BigNumber(Util.toQsp(1200)),
    'bonusExpertFactor' : new BigNumber(0),
    'bonusFirstExpertFactor' : new BigNumber(100),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(20),
    'minStakeTimeInBlocks' : new BigNumber(1000000),
    'timeoutInBlocks' : new BigNumber(2000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "URL",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1
  };

  // Gray Pool params
  let grayPoolParams = {
    'candidateContract' : Util.ZERO_ADDRESS,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder2,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(200)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(200)),
    'depositQspWei' : new BigNumber(Util.toQsp(20000)),
    'bonusExpertFactor' : new BigNumber(150),
    'bonusFirstExpertFactor' : new BigNumber(180),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(40),
    'minStakeTimeInBlocks' : new BigNumber(200),
    'timeoutInBlocks' : new BigNumber(5000),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "https://quantstamp.atlassian.net/wiki/spaces/QUAN/pages/35356673/Presentations+Repository",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1
  };

  it("should instantiate the Security Expert TCR and add staker1 before the Assurance Contract is created", async function() {
    // instantiate QSP Token
    quantstampToken = await QuantstampToken.new(owner.address, {from: owner});
    // instantiate Security Expert TCR
    voting = await Voting.new(quantstampToken.address);
    quantstampParameterizer = await QuantstampParameterizer.new();
    await quantstampParameterizer.init(quantstampToken.address, voting.address, TCRUtil.parameters);
    quantstampRegistry = await QuantstampStakingRegistry.new();
    await quantstampRegistry.init(quantstampToken.address,voting.address,quantstampParameterizer.address, 'QSPtest');
    // enable transfers before any payments are allowed
    await quantstampToken.enableTransfer({from : owner});
    // award budget to staker1
    await quantstampToken.transfer(staker1, staker1Budget, {from : owner});
    // add staker1 to Security Expert TCR
    await quantstampToken.approve(quantstampRegistry.address, minDeposit, {from : staker1});
    await TCRUtil.addToWhitelist(staker1, TCRUtil.minDep, staker1, quantstampRegistry);
    // instantiate Assurance Protocol contract
    qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address, {from: owner});
    // check if staker1 is considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isTrue(await qspb.isExpert(staker1));
    // allow the Assurance protocol to transfer funds from staker1
    await quantstampToken.approve(qspb.address, staker1Budget, {from : staker1});
  });

  it("should not make any difference if staker2 is added to the TCR after the Assrunce contract was instantiated", async function() {
    // award budget to staker2
    await quantstampToken.transfer(staker2, staker2Budget, {from : owner});
    // add staker2 to Security Expert TCR
    await quantstampToken.approve(quantstampRegistry.address, minDeposit, {from : staker2});
    await TCRUtil.addToWhitelist(staker2, TCRUtil.minDep, staker2, quantstampRegistry);
    // check if staker2 is considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isTrue(await qspb.isExpert(staker2));
    // allow the Assurance protocol to transfer funds from staker2
    await quantstampToken.approve(qspb.address, staker2Budget, {from : staker2});
  });

  it("should create the Orange Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the orange pool
    orangePoolParams.candidateContract = await CandidateContract.new(candidateContractBalance);
    orangePoolParams.contractPolicy = await ZeroBalancePolicy.new();
    // award budget to stakeholder 1 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(orangePoolParams.owner, stakeholder1Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder1Budget, {from : orangePoolParams.owner});
    // quick check that balance is zero
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
    // create orange pool
    await instantiatePool(qspb, orangePoolParams);
    // update the time when the status of the pool changed
    orangePoolParams.timeOfStateInBlocks = new BigNumber(web3.eth.getBlock("latest").number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 1);
    orangePoolParams.index = currentPoolNumber - 1;
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
    // the balance of the Assurance contract should be increased by the amount deposited in the orange pool
    balanceOfQspb = balanceOfQspb.plus(orangePoolParams.depositQspWei);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should not make a difference if a staker5 is added to the TCR after a pool has been created", async function() {
    // award budget to staker5
    await quantstampToken.transfer(staker5, staker5Budget, {from : owner});
    // add staker5 to Security Expert TCR
    await quantstampToken.approve(quantstampRegistry.address, minDeposit, {from : staker5});
    await TCRUtil.addToWhitelist(staker5, TCRUtil.minDep, staker5, quantstampRegistry);
    // check if staker5 is considered a security expert from the point of view of the Assurnace Protocol contract
    assert.isTrue(await qspb.isExpert(staker5));
    // allow the Assurance protocol to transfer funds from staker5
    await quantstampToken.approve(qspb.address, staker5Budget, {from : staker5});
  });

  it("should place a stake for staker1 in the Orange Pool that is smaller than the minimum stake, which keeps the pool in the same state", async function() {
    // staker1 places a stake in the Orange Pool
    await qspb.stakeFunds(orangePoolParams.index, oneHundredQsp, {from : staker1});
    staker1StakeBlock = new BigNumber(web3.eth.getBlock("latest").number);
    // since staker1 is a security expert on the TCR, the pool should update its firstExpertStaker field
    orangePoolParams.firstExpertStaker = staker1;
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(oneHundredQsp);
    orangePoolParams.poolSizeQspWei = orangePoolParams.totalStakeQspWei.times(orangePoolParams.bonusExpertFactor.plus(100)).
      times(orangePoolParams.bonusFirstExpertFactor.plus(100)).dividedBy(new BigNumber(100).pow(2)); 
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1); 
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(oneHundredQsp);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should place a stake for staker2 in the Orange Pool, which causes the pool to transition into the NotViolatedFunded state", async function() {
    const fourHundredQsp = oneHundredQsp.times(4);
    // staker2 places a stake in the Orange Pool
    await qspb.stakeFunds(orangePoolParams.index, fourHundredQsp, {from : staker2});
    staker2StakeBlock = new BigNumber(web3.eth.getBlock("latest").number);
    // since the total amount staked in this pool is not over the minimum stake, the pool should transition to the NotViolatedFunded state
    orangePoolParams.state = PoolState.NotViolatedFunded;
    orangePoolParams.timeOfStateInBlocks = staker2StakeBlock;
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(fourHundredQsp);
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(fourHundredQsp.
      times(orangePoolParams.bonusExpertFactor.pow(2).plus(new BigNumber(100).pow(2))).dividedBy(new BigNumber(100).pow(2)));
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1); 
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(fourHundredQsp);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should place a stake for staker5 in the Orange Pool, which keeps the pool in the same state", async function() {
    const fortyTwoQsp = new BigNumber(Util.toQsp(42));
    // staker5 places a stake in the Orange Pool already after some blocks since the orange pool has transitioned into the NotViolatedFunded state
    await qspb.stakeFunds(orangePoolParams.index, fortyTwoQsp, {from : staker5});
    staker5StakeBlock = new BigNumber(web3.eth.getBlock("latest").number);
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(fortyTwoQsp);
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(fortyTwoQsp.
      times(orangePoolParams.bonusExpertFactor.pow(3).plus(new BigNumber(100).pow(3))).dividedBy(new BigNumber(100).pow(3)));
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1); 
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(fortyTwoQsp);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should create the Gray Pool according to the specified parameters", async function() {
    // instantiate candidate contract and its policy for the gray pool
    grayPoolParams.candidateContract = await CandidateToken.new(candidateContractBalance, {from : grayPoolParams.owner});
    grayPoolParams.contractPolicy = await OwnerNotChangedPolicy.new(grayPoolParams.owner);
    // award budget to stakeholder2 and approve transfers to the Assurance Protocol contract
    await quantstampToken.transfer(grayPoolParams.owner, stakeholder2Budget, {from : owner});
    await quantstampToken.approve(qspb.address, stakeholder2Budget, {from : grayPoolParams.owner});
    // create pool
    await instantiatePool(qspb, grayPoolParams);
    // update the time when the status of the pool changed
    grayPoolParams.timeOfStateInBlocks = new BigNumber(web3.eth.getBlock("latest").number);
    // check that the current number of pools is one
    currentPoolNumber = await qspb.getPoolsLength();
    assert.equal(currentPoolNumber, 2);
    grayPoolParams.index = currentPoolNumber - 1;
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, grayPoolParams));
    // the balance of the Assurance contract should be increased by the amount deposited in the gray pool
    balanceOfQspb = balanceOfQspb.plus(grayPoolParams.depositQspWei);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should reject the payout request of staker1 because the payout period has not yet passed for the orange pool", async function() {
    // check that the pay period for the orange pool has not passed yet
    const currentBlock = new BigNumber(web3.eth.getBlock("latest").number);
    assert.isTrue(currentBlock.lt(orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks)), currentBlock.toNumber() + " != " + orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks).toNumber());
    // staker1 wants to withdraw his payout before the pay period has passed and gets rejected
    Util.assertTxFail(qspb.withdrawInterest(orangePoolParams.index, staker1, {from : staker1}));
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
  });

  it("should place a stake for staker4 in the Orange Pool, which keeps the pool in the same state", async function() {
    // award budget to staker4
    await quantstampToken.transfer(staker4, staker4Budget, {from : owner});
    // allow the Assurance protocol to transfer funds from staker5
    await quantstampToken.approve(qspb.address, staker4Budget, {from : staker4});
    const fiveHundredQsp = oneHundredQsp.times(5);
    // staker4 places a stake in the Orange Pool already after some blocks since the orange pool has transitioned into the NotViolatedFunded state
    await qspb.stakeFunds(orangePoolParams.index, fiveHundredQsp, {from : staker4});
    staker4StakeBlock = new BigNumber(web3.eth.getBlock("latest").number);
    // the total QSP staked should also increase, as well as the pool size and stake count
    orangePoolParams.totalStakeQspWei = orangePoolParams.totalStakeQspWei.plus(fiveHundredQsp);
    orangePoolParams.poolSizeQspWei = orangePoolParams.poolSizeQspWei.plus(fiveHundredQsp.
      times(orangePoolParams.bonusExpertFactor.pow(4).plus(new BigNumber(100).pow(4))).dividedBy(new BigNumber(100).pow(4)));
    orangePoolParams.stakeCount = orangePoolParams.stakeCount.plus(1); 
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
    // the balance of the Assurance contract should be increased by the amount staked in the orange pool
    balanceOfQspb = balanceOfQspb.plus(fiveHundredQsp);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should award the payout to staker1 after the first pay period has passed", async function() {
    // check that the pay period for the orange pool has not passed yet
    const currentBlock = new BigNumber(web3.eth.getBlock("latest").number);
    assert.isTrue(currentBlock.lt(orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks)), currentBlock.toNumber() + " != " + orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks).toNumber());
    // fast-forward to block where the first pay period ends
    const blocksUntilFirstPayout = orangePoolParams.timeOfStateInBlocks.plus(orangePoolParams.payPeriodInBlocks).minus(currentBlock);
    Util.mineNBlocks(blocksUntilFirstPayout);
    // compute payout for staker1
    const payoutStaker1 = await qspb.computePayout(orangePoolParams.index, staker1);
    // staker1 wants to withdraw his payout and receives it
    await qspb.withdrawInterest(orangePoolParams.index, staker1, {from : staker1});
    // the deposit of the orange pool needs to be updated
    orangePoolParams.depositQspWei = orangePoolParams.depositQspWei.minus(payoutStaker1);
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, orangePoolParams));
    // the balance of the Assurance contract should be decreased by the amount withdrawn from the orange pool
    balanceOfQspb = balanceOfQspb.minus(payoutStaker1);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });

  it("should place a stake for staker3 in the Gray Pool and transition the pool in the NotViolatedFunded state", async function() {
    // award budget to staker3
    await quantstampToken.transfer(staker3, staker3Budget, {from : owner});
    // allow the Assurance protocol to transfer funds from staker3
    await quantstampToken.approve(qspb.address, staker3Budget, {from : staker3});
    const twoHundredQsp = oneHundredQsp.times(2);
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, grayPoolParams));
    // check that the policy is not violated
    assert.equal(await grayPoolParams.contractPolicy.isViolated(grayPoolParams.candidateContract.address), false);
    // staker3 places a stake in the Gray Pool
    await qspb.stakeFunds(grayPoolParams.index, twoHundredQsp, {from : staker3});
    staker3StakeBlock = new BigNumber(web3.eth.getBlock("latest").number);
    // since the total amount staked in this pool is equal to the minimum stake, the pool should transition to the NotViolatedFunded state
    grayPoolParams.state = PoolState.NotViolatedFunded;
    grayPoolParams.timeOfStateInBlocks = staker3StakeBlock;
    // the total QSP staked should also increase, as well as the pool size and stake count
    grayPoolParams.totalStakeQspWei = grayPoolParams.totalStakeQspWei.plus(twoHundredQsp);
    grayPoolParams.poolSizeQspWei = grayPoolParams.poolSizeQspWei.plus(twoHundredQsp);
    grayPoolParams.stakeCount = grayPoolParams.stakeCount.plus(1); 
    // check that all pool properties are as expected
    assert.isTrue(await arePoolParametersAsExpected(qspb, grayPoolParams));
    // the balance of the Assurance contract should be increased by the amount staked in the gray pool
    balanceOfQspb = balanceOfQspb.plus(twoHundredQsp);
    assert.isTrue(balanceOfQspb.eq(await qspb.balanceQspWei.call()));
  });
});
