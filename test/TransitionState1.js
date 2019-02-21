const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const QuantstampToken = artifacts.require('QuantstampToken');
const ExpertRegistry = artifacts.require('WhitelistExpertRegistry');
const Policy = artifacts.require('policies/TrivialBackdoorPolicy');
const Util = require("./util.js");
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


contract('TransitionState1.js (Initialized): check transitions', function(accounts) {

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
   * Mines blocks until we reach block timeout +- offset for the pool with
   * given poolId. Examples:
   *
   * mineUntilTimeout(poolId, poolTimeout.sub(1)) mines until one block before timeout
   * mineUntilTimeout(poolId, poolTimeout) mines until the first timeout block
   * mineUntilTimeout(poolId, poolTimeout.add(1)) mines until one block after timeout
   */
  async function mineUntilTimeout(poolId, offset) {
    await assertPoolState(poolId, PoolState.Initialized);
    const timeout = await stakingData.getPoolTimeoutInBlocks(poolId);
    const start = await stakingData.getPoolTimeOfStateInBlocks(poolId);
    const end = start.add(timeout);
    const now = await Util.getBlockNumber();
    const left = end.sub(now).add(offset);
    if (left.gt(0)) {
      await Util.mineNBlocks(left);
    }
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
  });


  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {

    /*
     * Waits for the timeout and makes a deposit while policy is not violated.
     * Then verifies that the pool was cancelled regardless of the deposit amount.
     */
    it("1.4 if deposit >,=,< maxPayout and timeout happened without policy violated, switch to Cancelled",
      async function() {
        // three pools require 3x the approval
        await token.approve(qspb.address, pool.depositQspWei.times(3), {from : stakeholder});
        pool.poolName = "1"; // todo(mderka): remove this if pool names do not need to be unique
        await instantiatePool(pool);
        pool.poolName = "2"; // todo(mderka): remove this if pool names do not need to be unique
        await instantiatePool(pool);
        pool.poolName = "3"; // todo(mderka): remove this if pool names do not need to be unique
        await instantiatePool(pool);

        await mineUntilTimeout(firstPoolId, 0);

        // all pools are timed out now
        await qspb.depositFunds(firstPoolId, 0, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // await assertPoolState(firstPoolId, PoolState.Cancelled);

        // issue three approvals for deposits in the three pools at once
        const leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit.times(3), {from : stakeholder});

        await qspb.depositFunds(firstPoolId + 1, leftToDeposit.sub(1), {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, firstPoolId + 1), PoolState.Cancelled);

        await qspb.depositFunds(firstPoolId + 2, leftToDeposit, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, firstPoolId + 2), PoolState.Cancelled);

        await qspb.depositFunds(firstPoolId + 3, leftToDeposit.add(1), {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, firstPoolId + 3), PoolState.Cancelled);
      }
    );

    /*
     * Waits for the timeout - 1  block and makes a deposit while policy is not violated.
     * Then verifies that the pool was not cancelled. Then repeats (mining one extra block)
     * and verifies that the pool was cancelled.
     */
    it("1.4 edge case for switching the pool to cancelled state",
      async function() {
        await mineUntilTimeout(firstPoolId, -1);
        await qspb.depositFunds(firstPoolId, 0, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Initialized);

        // this deposit will mine one more block
        await qspb.depositFunds(firstPoolId, 0, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Works without timeout and with policy that is not violated. It deposits
     * funds that insufficient to cover the payout, then adds more and in each
     * step verifies that the state remained Initialized.
     */
    it("1.7 if deposit >,=,< maxPayout stay in this state if timeout did not happen",
      async function() {
        await qspb.depositFunds(firstPoolId, 0, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Initialized);

        // approve all the possible transfers at once by adding 100
        const leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, (leftToDeposit.add(100)), {from : stakeholder});

        // not enough
        await qspb.depositFunds(firstPoolId, leftToDeposit.sub(1), {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Initialized);

        // just enough
        await qspb.depositFunds(firstPoolId, 1, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Initialized);

        // more than enough deposit for the payout
        await qspb.depositFunds(firstPoolId, 1, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Initialized);
      }
    );

    /*
     * Violates the policy, calls the function with no funds and checks
     * that the pool is cancelled.
     */
    it("1.4 deposit < maxPayout cancels the pool when the policy is violated",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when implemented
        // await qspb.depositFunds(firstPoolId, 0, {from : stakeholder});
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  
    /*
     * Violates the policy, calls the function with just enough funds
     * and checks that the pool is cancelled.
     */
    it("1.4 deposit = maxPayout cancels the pool when the policy is violated",
      async function() {
        // approve tokens and violate the policy
        const leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit, {from : stakeholder});
        await policy.updateStatus(true);

        // deposit funds and check the status
        // todo(mderka): uncomment when implemented
        // await qspb.depositFunds(firstPoolId, leftToDeposit, {from : stakeholder});
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Violates the policy, calls the function with more than enough funds
     * and checks that the pool is cancelled.
     */
    it("1.4 deposit > maxPayout cancels the pool when the policy is violated",
      async function() {
        // approve tokens and violate the policy
        const leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit.add(1), {from : stakeholder});
        await policy.updateStatus(true);

        // deposit funds and check the status
        // todo(mderka): uncomment when implemented
        // await qspb.depositFunds(firstPoolId, leftToDeposit.add(1), {from : stakeholder});
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function withdrawDepost
   */
  describe("withdrawDeposit", async function() {

    /*
     * Makes a deposit and then withdraws it. Then verifies that the pool was cancelled.
     */
    it("1.5 switch to Cancelled if the policy is not violated and timeout did not happen",
      async function() {
        await qspb.withdrawDeposit(firstPoolId, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Makes no deposit, violates the policy, and tries to withdraw. Then verifies that the
     * pool was cancelled.
     */
    it("1.5 switch to Cancelled even if the policy is violated",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawDeposit(firstPoolId, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Makes no deposit, waits for a safe timeout (+5 blocks), and tries to withdraw.
     * Then verifies that the pool was cancelled.
     */
    it("1.5 if timeout happend with policy not being violated should also switch into Cancelled",
      async function() {
        await mineUntilTimeout(firstPoolId, +5);
        await qspb.withdrawDeposit(firstPoolId, {from : stakeholder});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {

    /*
     * Violates the policy, stakes a few tokens and attempts to withdraw stake. Then verifies
     * that the pool was cancelled.
     */
    it("1.4 if the policy is violated, switch to cancelled",
      async function() {
        await token.approve(qspb.address, 7, {from : staker});
        await qspb.stakeFunds(firstPoolId, 7, {from : staker});
        // keep this violation after staking, otherwise the state will change
        await policy.updateStatus(true);
        await qspb.withdrawStake(firstPoolId, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Waits for the timeout, stakes a few tokens and attempts to withdraw stake. Then verifies
     * that the pool was cancelled.
     */
    it("1.4 if timeout happened, switch to cancelled",
      async function() {
        // mine 2 more blocks
        await token.approve(qspb.address, 8, {from : staker});
        await qspb.stakeFunds(firstPoolId, 8, {from : staker});
        // mine 1 less blocks that is needed for the timeout.
        // last block is mined with the withdrawStake call iteself.
        await mineUntilTimeout(firstPoolId, -1);
        // asserting the state precondition
        await assertPoolState(firstPoolId, PoolState.Initialized);

        await qspb.withdrawStake(firstPoolId, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Stakes a few tokens and attempts to withdraw stake. Then verifies
     * the the pool remained in the current state.
     */
    it("1.7 if timeout did not happen and policy is not violated, remain in this state",
      async function() {
        await token.approve(qspb.address, 9, {from : staker});
        await qspb.stakeFunds(firstPoolId, 9, {from : staker});
        await qspb.withdrawStake(firstPoolId, {from : staker});
        // todo(mderka): uncomment when the bug is removed, SP-227
        //await assertPoolState(firstPoolId, PoolState.Initialized);
      }
    );

    /*
     * Stakes 0 tokens, violates the policy and attempts to withdraw stake. Then verifies
     * the the pool remained in the current state.
     */
    it("1.4 no stake, if the policy is violated, switch to cancelled",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawStake(firstPoolId, {from : staker});
        // todo(mderka): uncomment when transition is implemented for 0 stake
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Waits for the timeout, stakes 0 tokens and attempts to withdraw stake. Then verifies
     * the the pool was cancelled.
     */
    it("1.4 no stake, if timeout happened, switch to cancelled",
      async function() {
        await mineUntilTimeout(firstPoolId, 0);
        await qspb.withdrawStake(firstPoolId, {from : staker});
        // todo(mderka): uncomment when transition is implemented for 0 stake
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Stakes 0 tokens and attempts to withdraw stake. Then verifies
     * the the pool remained in the current state.
     */
    it("1.7 no stake, if timeout did not happen and policy is not violated, remain in this state",
      async function() {
        await qspb.withdrawStake(firstPoolId, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Initialized);
      }
    );
  });


  /*
   * Tests for function withdrawInterest
   */
  describe("withdrawInterest", async function() {

    /*
     * Tests that the call to the function is not allowed
     */
    it("1.9 withdrawInterest: call is not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawInterest(firstPoolId, {from : staker}));
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {

    /*
     * Tests that the call to the function is not allowed if the policy is not
     * violated and the timeout did not happen.
     */
    it("1.10 call is not allowed when timeout did not happen and policy is not violated",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(firstPoolId, {from : stakeholder}));
      }
    );

    /*
     * Tests that the call to the function is allowed if the policy is not
     * violated and the timout did happen.
     */
    it("1.4 if timeout happened, cancel the pool",
      async function() {
        // todo(mderka): uncomment when implemented
        // await mineUntilTimeout(firstPoolId, 0);
        // await qspb.withdrawClaim(firstPoolId, {from : stakeholder});
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that the call to the function is allowed if the policy is
     * violated and the timout did not happen.
     */
    it("1.4 if the policy is violated, cancel the pool",
      async function() {
        // todo(mderka): uncomment when implemented
        await policy.updateStatus(true);
        // await qspb.withdrawClaim(firstPoolId, {from : stakeholder});
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {

    /*
     * Violates the policy and checks that the pool gets cancelled.
     */
    it("1.6 if policy is violated switch state to cancelled",
      async function() {
        await policy.updateStatus(true);
        await qspb.checkPolicy(firstPoolId, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("1.11 if policy is not violated, fail loud",
      async function() {
        Util.assertTxFail(qspb.checkPolicy(firstPoolId, {from : staker}));
      }
    );
  });


  /*
   * Tests for function stakeFunds
   */
  describe("stakeFunds", async function() {

    /*
     * Waits for the timeout and then attempts to stake a few tokens.
     * Checks that the pool was cancelled afterwards.
     */
    it("1.4 cancel if timeout happened",
      async function() {
        await token.approve(qspb.address, 14, {from : staker});
        await mineUntilTimeout(firstPoolId, 0);
        await qspb.stakeFunds(firstPoolId, 14, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Violates the policy and attempts to stake a few tokens. Checks
     * that the pool was cancelled afterwards.
     */
    it("1.4 cancel if policy is violated",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when the modifier is removed
        // await token.approve(qspb.address, 7, {from : staker});
        // await qspb.stakeFunds(firstPoolId, 7, {from : staker});
        // await assertPoolState(firstPoolId, PoolState.Cancelled);
      }
    );

    /*
     * Stakes a few tokens (less than min stake) in a healthy pool. Verifies that the status did
     * no change.
     */
    it("1.8 stays in the same state if stake is too low, policy is not violated, and timeout did not happen",
      async function() {
        await token.approve(qspb.address, 13, {from : staker});
        await qspb.stakeFunds(firstPoolId, 13, {from : staker});
        await assertPoolState(firstPoolId, PoolState.Initialized);
      }
    );

    /*
     * Funds pool. Stakes too few tokens into a healthy pool. The status should not change. Then stakes more
     * tokens to satisfy the min stake. Verifies that the poll became NotViolatedFunded.
     */
    it("1.3 if the sum of stakes is >= minStake and deposit is large enough, transition to NotViolatedFunded.",
      async function() {
        // fund pool
        let leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit, {from : stakeholder});
        await qspb.depositFunds(firstPoolId, leftToDeposit, {from : stakeholder});

        // stake just not enough
        await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
        await qspb.stakeFunds(firstPoolId, pool.minStakeQspWei.sub(1), {from : staker});
        await assertPoolState(firstPoolId, PoolState.Initialized);
        // stake enough
        await qspb.stakeFunds(firstPoolId, 1, {from : staker});
        await assertPoolState(firstPoolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Stakes too few tokens into a healthy pool. The status should not change. Then stakes more
     * tokens to satisfy the min stake. Verifies tha the poll became NotViolatedUnderFunded.
     */
    it("1.1 if the sum of stakes is >= minStake and deposit is not large enough, transition to NotViolatedUnderfunded.",
      async function() {
        await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
        // stake just not enough
        await qspb.stakeFunds(firstPoolId, pool.minStakeQspWei.sub(1), {from : staker});
        await assertPoolState(firstPoolId, PoolState.Initialized);
        // stake enough
        await qspb.stakeFunds(firstPoolId, 1, {from : staker});
        await assertPoolState(firstPoolId, PoolState.NotViolatedUnderfunded);
      }
    );
  });
});

