const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const QuantstampToken = artifacts.require('QuantstampToken');
const ExpertRegistry = artifacts.require('WhitelistExpertRegistry');
const Policy = artifacts.require('policies/TrivialBackdoorPolicy');
const Util = require("../util.js");
const BigNumber = require('bignumber.js');

const PoolState = Object.freeze({
  None : 0,
  Initialized : 1,
  NotViolatedUnderfunded : 2,
  ViolatedUnderfunded : 3,
  NotViolatedFunded : 4,
  ViolatedFunded : 5,
  Cancelled: 6,
  PolicyExpired: 7
});


contract('CancelledState.js: check transitions', function(accounts) {

  const owner = accounts[0];
  const staker = accounts [1];
  const stakeholder = accounts[2];
  const qspAdmin = accounts[3];
  const nonZeroAddress = accounts[4];
  const pool = {
    'candidateContract' : nonZeroAddress,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(100)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(42)),
    'depositQspWei' : new BigNumber(Util.toQsp(5)),
    'bonusExpertFactor' : 0,
    'bonusFirstExpertFactor' : new BigNumber(100),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(20),
    'minStakeTimeInBlocks' : new BigNumber(1000000),
    'timeoutInBlocks' : new BigNumber(50),
    'timeOfStateInBlocks' : new BigNumber(0),
    'urlOfAuditReport' : "URL",
    'state' : PoolState.Initialized,
    'totalStakeQspWei' : new BigNumber(Util.toQsp(0)),
    'poolSizeQspWei' : new BigNumber(Util.toQsp(0)),
    'stakeCount' : new BigNumber(0),
    'index' : -1,
    'poolName' : "Orange Pool",
    'maxTotalStake' : new BigNumber(Util.toQsp(1000000))
  };

  const firstPoolId = 0;
  let token = null;
  let qspb = null;
  let policy = null;
  let stakingData = null;

  /*
   * Asserts states of the pool with the given id.
   */
  async function assertPoolState(id, state) {
    assert.equal(await Util.getState(qspb, id), state);
  }
  
  /*
   * Instantiates a new pool with the given parameters.
   */
  async function instantiatePool(poolParams) {
    await qspb.createPool(poolParams.candidateContract,
      poolParams.contractPolicy,
      poolParams.maxPayoutQspWei,
      poolParams.minStakeQspWei,
      poolParams.depositQspWei,
      poolParams.bonusExpertFactor,
      poolParams.bonusFirstExpertFactor,
      poolParams.payPeriodInBlocks,
      poolParams.minStakeTimeInBlocks,
      poolParams.timeoutInBlocks,
      poolParams.urlOfAuditReport,
      poolParams.poolName,
      poolParams.maxTotalStake,
      {from : poolParams.owner}
    );
  }

  /*
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the initialized state.
   */
  beforeEach(async function() {

    // create QSP token
    token = await QuantstampToken.new(qspAdmin, {from : owner});
    await token.enableTransfer({from : owner});

    // create staking protocol
    const registry = await ExpertRegistry.new({from : owner});
    stakingData = await QuantstampStakingData.new(token.address, {from : owner});
    qspb = await QuantstampStaking.new(token.address, registry.address, stakingData.address, {from: owner});
    await stakingData.addWhitelistAddress(qspb.address, {from : owner});

    // create policy
    policy = await Policy.new();
    pool.contractPolicy = policy.address;

    // give staker enought tokens than ever needed
    await token.transfer(staker, pool.minStakeQspWei.times(10), {from : owner});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(pool);
    await assertPoolState(firstPoolId, PoolState.Initialized);

    // make the pool cancelled
    await qspb.withdrawDeposit(firstPoolId, {from : stakeholder});
    await assertPoolState(firstPoolId, PoolState.Cancelled);
  });


  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {

    it("6.2 call not allowed, pool stays in Cancelled",
      async function() {
        await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
        Util.assertTxFail(qspb.depositFunds(firstPoolId, pool.depositQspWei, {from : stakeholder}));
        assert.equal(await Util.getState(qspb, firstPoolId), PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawDepost
   */
  describe("withdrawDeposit", async function() {

    it("6.1 call is allowed, but pool stays in Cancelled",
      async function() {
        // todo(amurashkin): make this call succeed. Currently, it fails loud
        // await qspb.withdrawDeposit(firstPoolId, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {

    it("6.1 call is allowed, but pool should remain in the Cancelled state",
      async function() {
        await qspb.withdrawStake(firstPoolId, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function withdrawInterest
   */
  describe("withdrawInterest", async function() {

    it("6.2 call is not allowed, pool remains in the Cancelled state",
      async function() {
        Util.assertTxFail(qspb.withdrawInterest(firstPoolId, {from : staker}));
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {

    it("6.2 call is not allowed",
      async function() {
        await policy.updateStatus(true);
        Util.assertTxFail(qspb.withdrawClaim(firstPoolId, {from : stakeholder}));
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {

    it("6.2 if policy is not violated, fail loud",
      async function() {
        Util.assertTxFail(qspb.checkPolicy(firstPoolId, {from : staker}));
      }
    );

    it("6.1 if policy is violated, do not fail, but remain in the cancelled state",
      async function() {
        await policy.updateStatus(true);
        await qspb.checkPolicy(firstPoolId, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function stakeFunds
   */
  describe("stakeFunds", async function() {

    it("6.2 call is not allowed",
      async function() {
        const stakeAmout = 13;
        await token.approve(qspb.address, stakeAmout, {from : staker});
        Util.assertTxFail(qspb.stakeFunds(firstPoolId, stakeAmout, {from : staker}));
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });
});
