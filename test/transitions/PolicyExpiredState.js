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


contract('PolicyExpiredState.js: check transitions', function(accounts) {

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
   * mineUntilMinStakingTime(poolId, 0) mines until the first timeout block
   * mineUntilMinStakingTime(poolId, -1) mines until one block after timeout
   */
  async function mineUntilMinStakingTime(poolId, offset) {
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
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the PolicyExpired state.
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
    
    // stake enough such that the policy transitions from the Initialized state to the NotVioladatedFunded state
    await qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker});
    await assertPoolState(poolId, PoolState.NotViolatedFunded);
    
    // wait until policy expires
    await mineUntilMinStakingTime(poolId, 0);

    // any user action at this point should transition into the PolicyExpired state
    await qspb.depositFunds(poolId, 0, {from : stakeholder});
    await assertPoolState(poolId, PoolState.PolicyExpired);
  });

  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {
    /*
     * Tests that calling this function before the minStakingTime passes twice AND there are still are stakes in the
     * pool, will execute the call and stay in the same state
     */
    it("7.1 pool did not expire twice and stakes are still present, stay in state 7",
      async function() {
        await qspb.depositFunds(poolId, pool.maxPayoutQspWei, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that calling this function after the minStakingTime passes twice will
     * transition the pool into the Cancelled state
     */
    it("7.3 checks that after the minStakingTime passes twice, the pool transitions to Cancelled",
      async function() {
        // wait until minStakingTime passes twice
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.depositFunds(poolId, pool.maxPayoutQspWei, {from : stakeholder});
        // todo (sebi): uncomment assert after the FSM is implemented
        //await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that calling this function after there are no more stakes in the
     * pool, will transition the pool into the Cancelled state
     */
    it("7.3 checks that after there are no more stakes in the pool, it transitions to Cancelled",
      async function() {
        // withdraw all stakes from the pool
        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal((await data.getPoolTotalStakeQspWei(poolId, {from : owner})).toNumber(), 0);
        // todo (sebi): Uncomment when implementation is finished
        //await assertPoolState(poolId, PoolState.PolicyExpired);
        // try to deposit funds again
        await qspb.depositFunds(poolId, pool.maxPayoutQspWei, {from : stakeholder});
        // todo (sebi): uncomment assert after the FSM is implemented
        //await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawStake.
   */
  describe("withdrawStake", async function() {
    /*
     * Tests that calling this function before the minStakingTime passes twice
     * will execute the call and stay in the same state
     */
    it("7.2 checks that before the minStakingTime passes twice, the pool stays in the same state",
      async function() {
        await qspb.withdrawStake(poolId, {from : staker});
        // todo (sebi): uncomment assert after the FSM is implemented
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that calling this function after the minStakingTime passes twice will
     * transition the pool into the Cancelled state
     */
    it("7.4 checks that after the minStakingTime passes twice, the pool transitions to Cancelled",
      async function() {
        // wait until minStakingTime passes twice
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo (sebi): uncomment assert after the FSM is implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawInterest.
   */
  describe("withdrawInterest", async function() {
    /*
     * Tests that calling this function before the minStakingTime passes twice
     * will execute the call and stay in the same state
     */
    it("7.2 checks that before the minStakingTime passes twice, the pool stays in the same state",
      async function() {
        await qspb.withdrawInterest(poolId, {from : staker});
        // todo (sebi): uncomment assert after the FSM is implemented
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that calling this function after the minStakingTime passes twice will
     * transition the pool into the Cancelled state
     */
    it("7.4 checks that after the minStakingTime passes twice, the pool transitions to Cancelled",
      async function() {
        // wait until minStakingTime passes twice
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawInterest(poolId, {from : staker});
        // todo (sebi): uncomment assert after the FSM is implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawDeposit.
   */
  describe("withdrawDeposit", async function() {
    /*
     * Tests that calling this function after the minStakingTime passes twice will
     * transition the pool into the Cancelled state
     */
    it("7.3 checks that after the minStakingTime passes twice, the pool transitions to Cancelled",
      async function() {
        // wait until minStakingTime passes twice
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that calling this function after there are no more stakes in the
     * pool, will transition the pool into the Cancelled state
     */
    it("7.3 checks that after there are no more stakes in the pool, it transitions to Cancelled",
      async function() {
        // withdraw all stakes from the pool
        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal((await data.getPoolTotalStakeQspWei(poolId, {from : owner})).toNumber(), 0);
        await assertPoolState(poolId, PoolState.PolicyExpired);
        // try to withdraw funds
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that calling this function before the minStakingTime passes twice and
     * there still are stakes in the pool is not allowed
     */
    it("7.5 checks that before the minStakingTime passes twice and there still are stakes, the call is not allowed",
      async function() {
        assert.isTrue((await data.getPoolTotalStakeQspWei(poolId, {from : owner})).gt(0));
        Util.assertTxFail(qspb.withdrawDeposit(poolId, {from : stakeholder}));
      }
    );
  });

  /*
   * Tests for function withdrawClaim.
   */
  describe("withdrawClaim", async function() {
    /*
     * Tests that calling this function after the minStakingTime passes twice will
     * transition the pool into the Cancelled state, when the policy is not violated
     */
    it("7.4 checks if the 2*maxStakingTime has passed and transitions to the Cancelled state when policy not violated",
      async function() {
        policy.updateStatus(false);
        // wait until minStakingTime passes twice
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo (sebi): uncomment assert after the FSM is implemented
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that calling this function after the minStakingTime passes twice will
     * transition the pool into the Cancelled state, when the policy is violated
     */
    it("7.4 checks if the 2*maxStakingTime has passed and transitions to the Cancelled state when policy violated",
      async function() {
        policy.updateStatus(true);
        // wait until minStakingTime passes twice
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo (sebi): uncomment assert after the FSM is implemented
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that calling this function before the minStakingTime passes twice is not allowed
     */
    it("7.6 checks that calling this function before the minStakingTime passes twice is not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
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
    it("7.7 call is not allowed",
      async function() {
        await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
        Util.assertTxFail(qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker}));
      }
    );
  });

  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {
    it("7.7 if policy is violated, fail",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when fixed
        // Util.assertTxFail(qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker}));
      }
    );

    it("7.7 if policy is not violated, fail loud",
      async function() {
        Util.assertTxFail(qspb.checkPolicy(poolId, {from : owner}));
      }
    );
  });
});
