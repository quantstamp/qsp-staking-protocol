const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const QuantstampToken = artifacts.require('QuantstampToken');
const ExpertRegistry = artifacts.require('WhitelistExpertRegistry');
const Policy = artifacts.require('policies/TrivialBackdoorPolicy');
const Util = require("./util.js");
const BigNumber = require('bignumber.js');

async function instantiatePool(qspb, poolParams) {
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
    {from : poolParams.owner});
}

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

  const poolId = 0;
  let token = null;
  let qspb = null;
  let policy = null;

  /*
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the initialized state.
   */
  beforeEach(async function() {

    // create QSP token
    token = await QuantstampToken.new(qspAdmin, {from : owner});
    await token.enableTransfer({from : owner});

    // create staking protocol
    let registry = await ExpertRegistry.new({from : owner});
    let stakingData = await QuantstampStakingData.new(token.address, {from : owner});
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
    await instantiatePool(qspb, pool);
  });


  /*
   * Tests for function depositFunds.
   */
  describe.only("depositFunds", async function() {

    /*
     * Waits for the timeout and makes a deposit while policy is not violated.
     * Then verifies that the pool was cancelled regardless of the deposit amount.
     */
    it("if deposit >,=,< maxPayout and timeout happened, switch to Cancelled",
      async function() {
        // three pools require 3x the approval
        await token.approve(qspb.address, pool.depositQspWei.times(3), {from : stakeholder});
        pool.poolName = "1"; // todo(mderka): remove this if pool names do not need to be unique
        await instantiatePool(qspb, pool);
        pool.poolName = "2"; // todo(mderka): remove this if pool names do not need to be unique
        await instantiatePool(qspb, pool);
        pool.poolName = "3"; // todo(mderka): remove this if pool names do not need to be unique
        await instantiatePool(qspb, pool);

        await Util.mineNBlocks(pool.timeoutInBlocks);

        // all pools are timed out now
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);

        // issue three approvals for deposits in the three pools at once
        let leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit.times(3), {from : stakeholder});

        await qspb.depositFunds(poolId + 1, leftToDeposit.sub(1), {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId + 1), PoolState.Cancelled);

        await qspb.depositFunds(poolId + 2, leftToDeposit, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId + 2), PoolState.Cancelled);

        await qspb.depositFunds(poolId + 3, leftToDeposit.add(1), {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId + 3), PoolState.Cancelled);
      }
    );

    /*
     * Waits for the timeout - 1  block and makes a deposit while policy is not violated.
     * Then verifies that the pool was not cancelled. Then repeats (mining one extra block)
     * and verifies that the pool was cancelled.
     */
    it("edge case for switching the pool to cancelled state",
      async function() {
        await Util.mineNBlocks(pool.timeoutInBlocks.sub(1));
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        // this deposit will mine one more block
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Works without timeout and with policy that is not violated. It deposits
     * funds that insufficitient to cover the payout, then adds more and in each
     * step verifies that the state remained Initialized.
     */
    it("both deposit >,=,< maxPayout stay in this state if timeout did not happen",
      async function() {
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        // approve all the possible transfers at once by adding 100
        let leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, (leftToDeposit.add(100)), {from : stakeholder});

        // not enough
        await qspb.depositFunds(poolId, leftToDeposit.sub(1), {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        // just enough
        await qspb.depositFunds(poolId, 1, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        await qspb.depositFunds(poolId, 1, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);
      }
    );

    /*
     * Violates the policy, calls the function and checks that the transaction failed.
     */
    it("deposit >,=,< maxPayout revert when the policy is violated",
      async function() {
        // approve all the possible transfers at once
        let leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit.times(3), {from : stakeholder});

        await policy.updateStatus(true);
        Util.assertTxFail(qspb.depositFunds(poolId, 0, {from : stakeholder}));
        Util.assertTxFail(qspb.depositFunds(poolId, leftToDeposit.sub(1), {from : stakeholder}));
        Util.assertTxFail(qspb.depositFunds(poolId, leftToDeposit, {from : stakeholder}));
        Util.assertTxFail(qspb.depositFunds(poolId, leftToDeposit.add(1), {from : stakeholder}));
      }
    );
  });


  /*
   * Tests for function withdrawDepost
   */
  describe.only("withdrawDeposit", async function() {

    /*
     * Makes a deposit and then withdraws it. Then verifies that the pool was cancelled.
     */
    it("always switch to Cancelled",
      async function() {
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Makes no deposit, violates the policy, and tries to withdraw. Then verifies that the
     * pool was cancelled.
     */
    it("switch to Cancelled even if the policy is violated",
      async function() {
        // todo(mderka): uncomment when implemented
        // await policy.updateStatus(true);
        // await qspb.withdrawDeposit(poolId, {from : stakeholder});
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Makes no deposit, waits for a timeout, and tries to withdraw. Then verifies that the
     * pool was cancelled.
     */
    it("in case for timeout, should also swith into Cancelled",
      async function() {
        // todo(mderka): uncomment when implemented
        // await Util.mineNBlocks(pool.timeoutInBlocks.add(5));
        // await qspb.withdrawDeposit(poolId, {from : stakeholder});
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe.only("withdrawStake", async function() {

    /*
     * Violates the policy, stakes a few tokens and attempts to withdraw stake. Then verifies
     * the the pool was cancelled.
     */
    it("if the policy is violated, switch to cancelled",
      async function() {
        await token.approve(qspb.address, 7, {from : staker});
        await qspb.stakeFunds(poolId, 7, {from : staker});
        // keep this violation after staking, otherwise the state will change
        await policy.updateStatus(true);
        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Waits for the timeout, stakes a few tokens and attempts to withdraw stake. Then verifies
     * the the pool was cancelled.
     */
    it("if timeout happened, switch to cancelled",
      async function() {
        // mine 3 less blocks that is needed for the timeout. 2 additional blocks will
        // be mined later, and the last block is the withdrawStake call iteself.
        await Util.mineNBlocks(pool.timeoutInBlocks.sub(3));
        // mine 2 more blocks
        await token.approve(qspb.address, 8, {from : staker});
        await qspb.stakeFunds(poolId, 8, {from : staker});
        // asserting the state precondition
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Stakes a few tokens and attempts to withdraw stake. Then verifies
     * the the pool remained in the current state.
     */
    it("if timeout did not happen and policy is not violated, remain in this state",
      async function() {
        await token.approve(qspb.address, 9, {from : staker});
        await qspb.stakeFunds(poolId, 9, {from : staker});
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when the bug is removed, SP-227
        //assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);
      }
    );

    /*
     * Stakes 0 tokens, violates the policy and attempts to withdraw stake. Then verifies
     * the the pool remained in the current state.
     */
    it("0 stake, if the policy is violated, switch to cancelled",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when transition is implemented for 0 stake
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Waits for the timeout, stakes 0 tokens and attempts to withdraw stake. Then verifies
     * the the pool was cancelled.
     */
    it("0 stake, if timeout happened, switch to cancelled",
      async function() {
        await Util.mineNBlocks(pool.timeoutInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when transition is implemented for 0 stake
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Stakes 0 tokens and attempts to withdraw stake. Then verifies
     * the the pool remained in the current state.
     */
    it("0 stake, if timeout did not happen and policy is not violated, remain in this state",
      async function() {
        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);
      }
    );
  });


  /*
   * Tests for function withdrawInterest
   */
  describe.only("withdrawInterest", async function() {

    /*
     * Tests that the call to the function is not allowed
     */
    it("withdrawInterest: call is not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawInterest(poolId, {from : staker}));
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe.only("withdrawClaim", async function() {

    /*
     * Tests that the call to the function is not allowed if the policy is not
     * violated and the timout did not happen.
     */
    it("call is not allowed when timeout did not happen and policy is not violated",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
      }
    );

    /*
     * Tests that the call to the function is allowed if the policy is not
     * violated and the timout did happen.
     */
    it("if timeout happened, cancel the pool",
      async function() {
        await Util.mineNBlocks(pool.timeoutInBlocks);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );
    
    /*
     * Tests that the call to the function is allowed if the policy is
     * violated and the timout did not happen.
     */
    it("if the policy is violated, cancel the pool",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );
  });


  /*
   * Tests for function checkPolicy
   */
  describe.only("checkPolicy", async function() {

    /*
     * Violates the policy and checks that the pool gets cancelled.
     */
    it("if policy is violated switch state to cancelled",
      async function() {
        await policy.updateStatus(true);
        await qspb.checkPolicy(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("if policy is not violated, fail loud",
      async function() {
        Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );
  });


  /*
   * Tests for function stakeFunds
   */
  describe.only("stakeFunds", async function() {

    /*
     * Waits for the timeout and then attempts to stake a few tokens.
     * Checks that the pool was cancelled afterwards.
     */
    it("cancel if timeout happened",
      async function() {
        await Util.mineNBlocks(pool.timeoutInBlocks.sub(1));
        // mines 1 extra blocks causing the timeout
        await token.approve(qspb.address, 14, {from : staker});
        await qspb.stakeFunds(poolId, 14, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Violates the policy and attempts to stake a few tokens. Checks
     * that the pool was cancelled afterwards.
     */
    it("cancel if policy is violated",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when the modifier is removed
        // await token.approve(qspb.address, 7, {from : staker});
        // await qspb.stakeFunds(poolId, 7, {from : staker});
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /*
     * Stakes a few tokens (less than min stake) in a healthy pool. Verifies that the status did
     * no change.
     */
    it("stays in the same state if stake is too low, policy is not violated, and timeout did not happen",
      async function() {
        await token.approve(qspb.address, 13, {from : staker});
        await qspb.stakeFunds(poolId, 13, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);
      }
    );

    /*
     * Funds poool. Stakes too few tokens into a healthy pool. The status should not change. Then stakes more
     * tokens to satisfy the min stake. Verifies tha the poll became NotViolatedFunded.
     */
    it("if the sum of stakes is >= minStake and deposit is large enough, transition to NotViolatedFunded.",
      async function() {
        // fund pool
        let leftToDeposit = pool.maxPayoutQspWei.sub(pool.depositQspWei);
        await token.approve(qspb.address, leftToDeposit, {from : stakeholder});
        await qspb.depositFunds(poolId, leftToDeposit, {from : stakeholder});

        // stake just not enough
        await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
        await qspb.stakeFunds(poolId, pool.minStakeQspWei.sub(1), {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);
        // stake enough
        await qspb.stakeFunds(poolId, 1, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedFunded);
      }
    );

    /*
     * Stakes too few tokens into a healthy pool. The status should not change. Then stakes more
     * tokens to satisfy the min stake. Verifies tha the poll became NotViolatedUnderFunded.
     */
    it("stakeFunds: if the sum of stakes is >= minStake and deposit is not large enough, transition to NotViolatedUnderfunded.",
      async function() {
        await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
        // stake just not enough
        await qspb.stakeFunds(poolId, pool.minStakeQspWei.sub(1), {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);
        // stake enough
        await qspb.stakeFunds(poolId, 1, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedUnderfunded);
      }
    );
  });
});
