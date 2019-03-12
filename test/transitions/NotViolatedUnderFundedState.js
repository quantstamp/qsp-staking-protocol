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


contract('NotViolatedUnderfundedState.js: check transitions', function(accounts) {

  const owner = accounts[0];
  const staker = accounts [1];
  const smallStaker = accounts [5];
  const stakeholder = accounts[2];
  const qspAdmin = accounts[3];
  const nonZeroAddress = accounts[4];
  const pool = {
    'candidateContract' : nonZeroAddress,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(101)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(42)),
    'depositQspWei' : new BigNumber(Util.toQsp(33)),
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
    await qspb.createPool(pool.candidateContract,
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
      {from : pool.owner}
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
    const timeout = await data.getPoolMinStakeTimeInBlocks(poolId);
    const start = await data.getPoolMinStakeStartBlock(poolId);
    assert.isTrue(start.gt(0));
    const end = start.add(timeout);
    const now = await Util.getBlockNumber();
    const left = end.sub(now).add(offset);
    if (left.gt(0)) {
      await Util.mineNBlocks(left);
    }
  }

  /*
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the NotViolatedUnderfunded state.
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
    // give tokens to stakers
    await token.transfer(staker, pool.maxTotalStake.times(10), {from : owner});
    await token.transfer(smallStaker, pool.minStakeQspWei.times(10), {from : owner});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(pool);

    // stake enough
    await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
    await qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker});
    await token.approve(qspb.address, 1, {from : smallStaker});
    await qspb.stakeFunds(poolId, 1, {from : smallStaker});

    // verify the initial state
    await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
  });

  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {

    /*
     * Tests that the pool remains in the same state when the policy is not violated, the
     * minStakingTime did not elapse, and the deposit is not large enough to cover the payout.
     */
    it("2.2 if the min staking time did not elapse, policy is not violated and deposit is too small, stay in state 2",
      async function() {
        const toDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei.add(1));
        assert.isTrue(pool.maxPayoutQspWei.gt(pool.depositQspWei.add(toDeposit)));
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Tests that the pool remains in the same state when the policy is not violated, the
     * minStakingTime did not elapse, and the deposit is not large enough to cover the payout.
     */
    it("2.2 if the min staking time did not elapse, policy is not violated and deposit is 0, stay in state 2",
      async function() {
        const toDeposit = 0;
        assert.isTrue(pool.maxPayoutQspWei.gt(pool.depositQspWei.add(toDeposit)));
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state ViolatedUnderfunded.
     */
    it("2.8 if the min staking time did not elapse and the policy is violated, move to state 3",
      async function() {
        const toDeposit = 11;
        assert.isTrue(pool.maxPayoutQspWei.gt(pool.depositQspWei.add(toDeposit)));
        await policy.updateStatus(true);
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state ViolatedUnderfunded even if the deposit it large enough.
     */
    it("2.8 if the min staking time did not elapse, large deposit, and the policy is violated, move to state 3",
      async function() {
        const toDeposit = 1100;
        assert.isTrue(pool.maxPayoutQspWei.gt(pool.depositQspWei.add(toDeposit)));
        await policy.updateStatus(true);
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Tests that the pool becomes NotViolatedFunded when the policy is not violated, the
     * minStakingTime did not elapse, and the deposit is large enough to cover the payout.
     */
    it("2.10 if the min staking time did not elapse, policy is not violated and deposit is enough, transition to state 4",
      async function() {
        const toDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy while expiring the pool and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if the min staking time elapsed once and the policy is violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        const toDeposit = 13;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired after depositing 0.
     */
    it("2.15 if the min staking time elapsed once and the policy is not violated, deposit 0, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        // todo(mderka): Uncomment when implemented
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired after depositing non-zero funds.
     */
    it("2.15 if the min staking time elapsed once, large deposit, and the policy is not violated, move to state 7",
      async function() {
        const toDeposit = 13001;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // todo(mderka): Uncomment when implemented
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Violates the policy twice while expiring the pool twise and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.14a if the min staking time elaped twice and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        const toDeposit = 13;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state PolicyExpired after depositing 0.
     */
    it("2.14a if the min staking time elapsed twice and the policy is not violated, deposit 0, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        // todo(mderka): Uncomment when implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state PolicyExpired after depositing non-zero funds.
     */
    it("2.14a if the min staking time elapsed twice, large deposit, and the policy is not violated, move to state 6",
      async function() {
        const toDeposit = 13001;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // todo(mderka): Uncomment when implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function withdrawDepost
   */
  describe("withdrawDeposit", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.11 if the min staking time elapsed and the policy is not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy with violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.11 if the min staking time elapsed and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is no transition and fail when the pool is not violated
     * and did not time out.
     */
    it("2.11 if the min staking time did not elapse and the policy is not violated, move to state 6",
      async function() {
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state Cancelled.
     */
    it("2.11 if the min staking time did not elapse and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        // todo(mderka): uncomment when the transition bug is removed
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {

    /*
     * Tests that there is no transition or fail when the policy is not violated, max staking time
     * did not elapse and there is still enough stake.
     */
    it("2.4 if did not expire, policy is not violated and there is still enough stake, stay in 2",
      async function() {
        await qspb.withdrawStake(poolId, {from : smallStaker});
        const totalStake = await data.getPoolTotalStakeQspWei(poolId);
        assert.isTrue(totalStake.gte(pool.minStakeQspWei));
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool, stakes are still high enough, checks that 
     * the pool gets to state ViolatedUnderfunded.
     */
    it("2.7 if did not expire and the policy is violated and there is still enough stake, move to state 3",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when this is allowed
        // await qspb.withdrawStake(poolId, {from : smallStaker});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * The policy is not violated, max staking time did not elapse and there is not
     * enough stake. The pool should be cancelled.
     */
    it("2.13 if did not expire, policy is violated and there is not enough stake, go to 6",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawStake(poolId, {from : staker});
        const totalStake = await data.getPoolTotalStakeQspWei(poolId);
        assert.isFalse(totalStake.gte(pool.minStakeQspWei));
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * The policy is not violated, max staking time did not elapse and there is not
     * enough stake. The pool should be cancelled.
     */
    it("2.13 if did not expire, policy is not violated and there is not enough stake, go to 6",
      async function() {
        await qspb.withdrawStake(poolId, {from : staker});
        const totalStake = await data.getPoolTotalStakeQspWei(poolId);
        assert.isFalse(totalStake.gte(pool.minStakeQspWei));
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired and the policy is not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when fixed
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired and the policy is violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when fixed
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice and the policy is not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when fixed
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when fixed
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function withdrawInterest
   */
  describe("withdrawInterest", async function() {

    /*
     * Validates that the pool has enough deposit to pay the staker including other stakers.
     * Without violating the policy or reaching the maximum staking time, it withdraws the
     * interest and verifies the pool remained in NonViolatedUnderfunded state.
     */
    it("2.1 did not expire, policy is not violated, enough to pay the interest, stay in 2",
      async function() {
        await Util.mineNBlocks(pool.payPeriodInBlocks);
        const payout = await qspb.computePayout(poolId, smallStaker);
        const depositLeft = await data.getPoolDepositQspWei(poolId);
        assert.isTrue(depositLeft.gte(payout));
        assert.isTrue(payout.gt(0));

        // todo(mderka): uncomment when call is possible
        // await qspb.withdrawInterest(poolId, {from : smallStaker});
        // await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state ViolatedUnderfunded.
     */
    it("2.6 if did not expire and the policy is violated, move to state 3",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when fixed
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Continuously decreases the deposit in the pool until it does not have enough to pay interest.
     * Without violating the policy or reaching the maximum staking time, it withdraws the
     * interest and verifies the pool transitions to Cancelled state.
     */
    it("2.12 if did not expire, policy is not violated, not enough to pay any interest, go to 6",
      async function() {
        // mine large number (10) of periouds for payout to exceed the deposit
        await Util.mineNBlocks(pool.payPeriodInBlocks.times(10));
        const payout = await qspb.computePayout(poolId, staker);
        const depositLeft = await data.getPoolDepositQspWei(poolId);
        assert.isTrue(payout.gt(depositLeft));

        // todo(mderka): uncomment when call is possible
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.16 if expired once and the policy is not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when call is possible
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.16 if expired once and the policy is violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when fixed
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.14a if expired twice and the policy is not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when call is possible
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.14a if expired twice once and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when fixed
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("2.8 if did not expire and the policy is violated, move to state 3",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when the call is possible
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once and the policy is not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when this does not fail
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once and the policy is violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when this does not fail
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice and the policy is not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("2.17 if not expired and the policy is not violated, fail",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
      }
    );
  });


  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state ViolatedUnderfunded.
     */
    it("2.9 if not expired and the policy is violated, move to state 3",
      async function() {
        await policy.updateStatus(true);
        await qspb.checkPolicy(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once and the policy is not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when fixed
        // await qspb.checkPolicy(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once and the policy is violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.checkPolicy(poolId, {from : staker});
        // todo(mderka): uncomment when the transition bug fixed
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.19 if expired twice and the policy is not violated, fail",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when fixed
        // await qspb.checkPolicy(poolId, {from : staker});
        // Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );

    /*
     * Expires the policy twice violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14b if expired twice and the policy is violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.checkPolicy(poolId, {from : staker});
        // todo(mderka): uncomment when the transition bug fixed
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("2.17 if not expired and the policy is not violated, stay in this state and fail loud",
      async function() {
        Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );
  });


  /*
   * Tests for function stakeFunds
   */
  describe("stakeFunds", async function() {

    /*
     * Tests that there is no fail and no transition when the pool is not violated and
     * it did not expire.
     */
    it("2.3 if not expired, not violated, max stake not reached, stay in this state and do not fail",
      async function() {
        const toStake = 14;
        await token.approve(qspb.address, toStake, {from : staker});
        await qspb.stakeFunds(poolId, toStake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Tests that there is no fail and no transition when the pool is not violated and
     * it did not expire.
     */
    it("2.20 if not expired, not violated, max stake reached, fail",
      async function() {
        // additional setup
        const overstake = pool.maxTotalStake;
        await token.approve(qspb.address, overstake, {from : staker});
        await qspb.stakeFunds(poolId, overstake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);

        // test starts here
        const toStake = 14;
        await token.approve(qspb.address, toStake, {from : staker});
        // todo(mderka): uncomment when implemented
        // Util.assertTxFail(qspb.stakeFunds(poolId, toStake, {from : staker}));
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets
     * to state ViolatedUnderfunded.
     */
    it("2.5 if not expired, violated, max stake not reached, move to state 3",
      async function() {
        await policy.updateStatus(true);
        const toStake = 6;
        await token.approve(qspb.address, toStake, {from : staker});
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets
     * to state ViolatedUnderfunded.
     */
    it("2.5 if not expired, violated, max stake reached, move to state 3",
      async function() {
        // additional setup
        const overstake = pool.maxTotalStake;
        await token.approve(qspb.address, overstake, {from : staker});
        await qspb.stakeFunds(poolId, overstake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);

        // test starts here
        await policy.updateStatus(true);
        const toStake = 6;
        await token.approve(qspb.address, toStake, {from : staker});
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice, not violated, max stake not reached, move to state 6",
      async function() {
        const toStake = 27;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice, violated, max stake not reached, move to state 6",
      async function() {
        await policy.updateStatus(true);
        const toStake = 31;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice, not violated, max stake reached, move to state 6",
      async function() {
        // additional setup
        const overstake = pool.maxTotalStake;
        await token.approve(qspb.address, overstake, {from : staker});
        await qspb.stakeFunds(poolId, overstake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);

        // test starts here
        const toStake = 11;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("2.14a if expired twice, violated, max stake reached, move to state 6",
      async function() {
        // additional setup
        const overstake = pool.maxTotalStake;
        await token.approve(qspb.address, overstake, {from : staker});
        await qspb.stakeFunds(poolId, overstake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);

        // test starts here
        await policy.updateStatus(true);
        const toStake = 1;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once, not violated, max stake not reached, move to state 7",
      async function() {
        const toStake = 27;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when this does not fail
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once, violated, max stake not reached, move to state 7",
      async function() {
        await policy.updateStatus(true);
        const toStake = 31;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once, not violated, max stake reached, move to state 7",
      async function() {
        // additional setup
        const overstake = pool.maxTotalStake;
        await token.approve(qspb.address, overstake, {from : staker});
        await qspb.stakeFunds(poolId, overstake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);

        // test starts here
        const toStake = 5;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when this does not fail
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("2.15 if expired once, violated, max stake reached, move to state 7",
      async function() {
        // additional setup
        const overstake = pool.maxTotalStake;
        await token.approve(qspb.address, overstake, {from : staker});
        await qspb.stakeFunds(poolId, overstake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);

        // test starts here
        await policy.updateStatus(true);
        const toStake = 3;
        await token.approve(qspb.address, toStake, {from : staker});
        await mineUntilMinStakingTime(poolId, 0);
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );
  });
});

