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


contract('NotViolatedFundedState.js: check transitions', function(accounts) {

  const owner = accounts[0];
  const staker = accounts [1];
  const stakeholder = accounts[2];
  const qspAdmin = accounts[3];
  const nonZeroAddress = accounts[4];
  const pool = {
    'candidateContract' : nonZeroAddress,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(101)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(42)),
    'depositQspWei' : new BigNumber(Util.toQsp(503)),
    'bonusExpertFactor' : 0,
    'bonusFirstExpertFactor' : new BigNumber(100),
    'firstExpertStaker' : Util.ZERO_ADDRESS,
    'payPeriodInBlocks' : new BigNumber(1),
    'minStakeTimeInBlocks' : new BigNumber(10), // keep this sufficiently high for withdrawInterest
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

  const poolId = 0;
  let token = null;
  let qspb = null;
  let policy = null;
  let data = null;

  /*
   * Asserts the state of the pool with given id.
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
   * Mines blocks until we reach block of staking timeout +- offset for the pool with
   * given poolId. Examples:
   *
   * mineUntilMinStakingTime(poolId, +1) mines until one block before timeout
   * mineUntilMinStakingTime(poolId, poolTimeout) mines until the first timeout block
   * mineUntilMinStakingTime(poolId, -1) mines until one block after timeout
   */
  async function mineUntilMinStakingTime(poolId, offset) {
    await assertPoolState(poolId, PoolState.NotViolatedFunded);
    const timeout = await data.getPoolMinStakeTimeInBlocks(poolId);
    const start = await data.getPoolTimeOfStateInBlocks(poolId);
    const end = start.add(timeout);
    const now = await Util.getBlockNumber();
    const left = end.sub(now).add(offset);
    if (left.gt(0)) {
      await Util.mineNBlocks(left);
    }
  }

  /*
   * Mines blocks for pay periods to elaps and withdraws interest for each
   * until the deposit left in the pool is less than balance.
   */
  async function mineAndWithdrawUntilDepositLeftLessThan(poolId, balance) {
    // note: this can make the method behave flaky if more than 1 pay periods are to be paid out
    let depositLeft = await data.getPoolDepositQspWei(poolId);
    await Util.mineNBlocks(pool.payPeriodInBlocks);
    while (depositLeft.gte(balance)) {
      await qspb.withdrawInterest(poolId, {from : staker});
      depositLeft = await data.getPoolDepositQspWei(poolId);
    }
  }

  /*
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the NotViolatedFunded state.
   */
  beforeEach(async function() {

    // create QSP token
    token = await QuantstampToken.new(qspAdmin, {from : owner});
    await token.enableTransfer({from : owner});

    // create staking protocol
    const registry = await ExpertRegistry.new({from : owner});
    data = await QuantstampStakingData.new(token.address, {from : owner});
    qspb = await QuantstampStaking.new(token.address, registry.address, data.address, {from: owner});
    await data.setWhitelistAddress(qspb.address, {from : owner});

    // create policy
    policy = await Policy.new();
    pool.contractPolicy = policy.address;
    // give tokens to staker
    const fundMultiplier = 10;
    await token.transfer(staker, pool.minStakeQspWei.times(fundMultiplier), {from : owner});
    await token.approve(qspb.address, pool.minStakeQspWei.times(fundMultiplier), {from : staker});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(fundMultiplier), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei.times(fundMultiplier), {from : stakeholder});
    await instantiatePool(pool);
    
    // stake enough
    await qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker});

    // violate the policy
    await policy.updateStatus(true);

    // any user action at this point should transition into the ViolatedFunded state
    await qspb.checkPolicy(poolId, {from : owner});
    await assertPoolState(poolId, PoolState.ViolatedFunded);
  });

  /*
   * Tests for function withdrawClaim.
   */
  describe("withdrawClaim", async function() {
    /*
     * Tests that the call is allowed and after executing it the pool remains in the same state.
     */
    it("5.1 withdrawClaim and stay in same state",
      async function() {
          await qspb.withdrawClaim(poolId, {from : stakeholder});
          await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });

  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {
    /*
     * Tests that the call to the function is not allowed.
     */
    it("5.2 depositFunds: call is now allowed",
      async function() {
          Util.assertTxFail(qspb.depositFunds(poolId, pool.maxPayoutQspWei, {from : stakeholder}));
      }
    );
  });

  /*
   * Tests for function withdrawDeposit.
   */
  describe("withdrawDeposit", async function() {
    /*
     * Tests that the call to the function is not allowed.
     */
    it("5.2 withdrawDeposit: call is now allowed",
      async function() {
          Util.assertTxFail(qspb.withdrawDeposit(poolId, pool.maxPayoutQspWei, {from : stakeholder}));
      }
    );
  });

  /*
   * Tests for function stakeFunds.
   */
  describe("stakeFunds", async function() {
    /*
     * Tests that the call to the function is not allowed.
     */
    it("5.2 stakeFunds: call is now allowed",
      async function() {
          Util.assertTxFail(qspb.stakeFunds(poolId, pool.maxPayoutQspWei, {from : staker}));
      }
    );
  });

  /*
   * Tests for function withdrawStake.
   */
  describe("withdrawStake", async function() {
    /*
     * Tests that the call to the function is not allowed.
     */
    it("5.2 withdrawStake: call is now allowed",
      async function() {
          Util.assertTxFail(qspb.withdrawStake(poolId, pool.maxPayoutQspWei, {from : staker}));
      }
    );
  });

  /*
   * Tests for function withdrawInterest.
   */
  describe("withdrawInterest", async function() {
    /*
     * Tests that the call to the function is not allowed.
     */
    it("5.2 withdrawInterest: call is now allowed",
      async function() {
          Util.assertTxFail(qspb.withdrawInterest(poolId, pool.maxPayoutQspWei, {from : staker}));
      }
    );
  });

  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {
    it("5.2 fails loud when not violated",
      async function() {
        await policy.updateStatus(false);
        Util.assertTxFail(qspb.checkPolicy(poolId, {from : owner}));
      }
    );

    it("5.2 remains in the same state when violated",
      async function() {
        await qspb.checkPolicy(poolId, {from : owner});
        await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });
});
