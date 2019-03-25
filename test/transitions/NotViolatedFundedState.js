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
   * Mines blocks for pay periods to elaps and withdraws interest for each
   * until the deposit left in the pool is less than balance.
   */
  async function mineAndWithdrawUntilDepositLeftLessThan(poolId, balance) {
    // note: this can make the method behave flaky if more than 1 pay periods are to be paid out
    let depositLeft = await data.getPoolDepositQspWei(poolId);
    let payout = await qspb.computePayout(poolId, staker);
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
    await token.transfer(staker, pool.maxTotalStake.times(10), {from : owner});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(pool);

    // stake enough
    await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
    await qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker});

    // verify the initial state
    await assertPoolState(poolId, PoolState.NotViolatedFunded);
  });

  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired after depositing 0.
     */
    it("4.9 if expired once and not violated, deposit 0, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired after depositing non-zero funds.
     */
    it("4.9 if expired once and not violated, move to state 7",
      async function() {
        const toDeposit = 13;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled after depositing non-zero funds.
     */
    it("4.8 if expired once and not violated, move to state 6",
      async function() {
        const toDeposit = 13;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // todo(mderka): uncomment when implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated.
     */
    it("4.1a if not expired and not violated, stay in this state and do not fail",
      async function() {
        const toDeposit = 12;
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("4.6 if not expired and the policy violated, move to state 5",
      async function() {
        const toDeposit = 11;
        await policy.updateStatus(true);
        await token.approve(qspb.address, toDeposit, {from : stakeholder});
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, toDeposit, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );

    /*
     * Violates the policy while expiring the pool it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.9 if expired once and violated, move to state 7",
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
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled after depositing non-zero funds.
     */
    it("4.8 if expired twice and violated, move to state 6",
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
  });


  /*
   * Tests for function withdrawDeposit
   */
  describe("withdrawDeposit", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy with violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice with violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is no transition and fail when the pool is not violated
     * and did not time out.
     */
    it("4.11 if not expired and not violated, fail",
      async function() {
        Util.assertTxFail(qspb.withdrawDeposit(poolId, {from : stakeholder}));
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("4.5 if not expired and violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired and not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawStake(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired and violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawStake(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        // todo(mderka): uncomment when implemented
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated.
     */
    it("4.11 if not expired and not violated, fail transaction",
      async function() {
        Util.assertTxFail(qspb.withdrawStake(poolId, {from : staker}));
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("4.5 if not expired and violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when this is allowed
        // await qspb.withdrawStake(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function withdrawInterest
   */
  describe("withdrawInterest", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Validates that the pool has enough deposit to pay the staker including other stakers.
     * Without violating the policy or reaching the maximum staking time, it withdraws the
     * insterest and verifies the the pool remained in NonViolatedFunded state.
     */
    it("4.2 if not expired, not violated, enough to pay and stay above maxPayout, stay in 4",
      async function() {
        const payout = await data.getPoolMaxPayoutQspWei(poolId);
        const depositLeft = await data.getPoolDepositQspWei(poolId);
        // validate that the precondition of the test is safely met
        // a single insterest is at most maxPayout so 3 * maxPayout is safe
        const safeSufficientDeposit = payout.times(3);
        assert.isTrue(depositLeft.gte(safeSufficientDeposit));

        await Util.mineNBlocks(pool.payPeriodInBlocks);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Continuously decreases the deposit in the pool until it does not have enough to pay interest.
     * Without violating the policy or reaching the maximum staking time, it withdraws the
     * insterest and verifies the the pool remained in NonViolatedFunded state.
     */
    it("4.7 if not expired, not violated, not enough to pay any interest, go to 6",
      async function() {
        // Keep withdrawing until there is not enough deposit left to make 2 more withdraws, only 1.
        // The payout for the only single staker is exactly maxPayoutQspWei per period.
        // The other maxPayoutQspWei is needed to pay the other stakers as per specification.
        // Therefore, we need at most maxPayoutQspWei + maxPayoutQspWei.
        // IMPORTANT: DO NOT PERFORM THE LAST WITHDRAW, IT CHANGES STATE
        let payout = await data.getPoolMaxPayoutQspWei(poolId);
        await mineAndWithdrawUntilDepositLeftLessThan(poolId, payout.times(2));

        // validate the precondition state
        await assertPoolState(poolId, PoolState.NotViolatedFunded);

        // mine several more pay periods to reach payout higher than the deposit left
        await Util.mineNBlocks(pool.payPeriodInBlocks.times(3));
        payout = await qspb.computePayout(poolId, staker);
        const depositLeft = await data.getPoolDepositQspWei(poolId);
        assert.isFalse(depositLeft.gte(payout));

        // attempt to make another withdraw
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Continuously decreases the deposit in the pool until it has just enough to pay intereste once.
     * Without violating the policy or reaching the maximum staking time, it withdraws the
     * insterest and verifies the the pool remained in NonViolatedFunded state.
     */
    it("4.3 not expired, not violated, enough to pay but dips below maxPayout, go to 2",
      async function() {
        // Keep withdrawing until there is not enough deposit left to for 2 maximum payouts.
        // The payout for the only single staker (as is in this case) is exactly maxPayoutQspWei per period.
        // The other maxPayoutQspWei is needed to pay the other stakers as per specification.
        // Therefore, we need less than maxPayoutQspWei + maxPayoutQspWei.
        await mineAndWithdrawUntilDepositLeftLessThan(poolId, pool.maxPayoutQspWei.times(2));
        // validation the precondition
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
        const depositLeft = await data.getPoolDepositQspWei(poolId);
        const payout = await qspb.computePayout(poolId, staker);
        assert.isTrue(depositLeft.gte(payout));
        assert.isFalse(depositLeft.sub(payout).gte(pool.maxPayoutQspWei));
        // the follwoing is the assumption of the test case
        assert.isTrue(payout.eq(pool.maxPayoutQspWei)); 

        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("4.5 if not expired and violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and not violated, move to state 7",
      async function() {
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy while violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and not violated, move to state 6",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("4.11 if not expired and not violated, fail",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
      }
    );

    /*
     * Violates the policy without expiring the pool and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("4.4 if not expired and violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and not violated, move to state 7",
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
    it("4.10 if expired once and violated, move to state 7",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, 0);
        await qspb.checkPolicy(poolId, {from : staker});
        // todo(mderka): uncomment when the transition bug fixed
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy twice without violating it and checks that the transaction fails.
     */
    it("4.12 if expired twice and not violated, fail",
      async function() {
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );

    /*
     * Expires the policy twice while violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8a if expired twice and violated, move to state 6",
      async function() {
        await policy.updateStatus(true);
        await mineUntilMinStakingTime(poolId, pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // await qspb.checkPolicy(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.Cancelled);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("4.11 if not expired and not violated, stay in this state",
      async function() {
        // todo(mderka): uncomment when the transition bug fixed
        // Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets to
     * state ViolatedFunded.
     */
    it("4.4 if not expired and violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.checkPolicy(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function stakeFunds
   */
  describe("stakeFunds", async function() {

    /*
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and not violated, max stake not reached, move to state 7",
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
    it("4.10 if expired once and violated, max stake not reached, move to state 7",
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
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and not violated, max stake not reached, move to state 6",
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
    it("4.8 if expired twice and violated, max stake not reached, move to state 6",
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
     * Expires the policy without violating it and checks that the pool gets to
     * state PolicyExpired.
     */
    it("4.10 if expired once and not violated, max stake reached, move to state 7",
      async function() {
        // additional setup
        await token.approve(qspb.address, pool.maxTotalStake, {from : staker});
        await qspb.stakeFunds(poolId, pool.maxTotalStake, {from : staker});

        // test case
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
    it("4.10 if expired once and violated, max stake reached, move to state 7",
      async function() {
        // additional setup
        await token.approve(qspb.address, pool.maxTotalStake, {from : staker});
        await qspb.stakeFunds(poolId, pool.maxTotalStake, {from : staker});

        // test case
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
     * Expires the policy twice without violating it and checks that the pool gets to
     * state Cancelled.
     */
    it("4.8 if expired twice and not violated, max stake reached, move to state 6",
      async function() {
        // additional setup
        await token.approve(qspb.address, pool.maxTotalStake, {from : staker});
        await qspb.stakeFunds(poolId, pool.maxTotalStake, {from : staker});

        // test case
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
    it("4.8 if expired twice and violated, max stake reached, move to state 6",
      async function() {
        // additional setup
        await token.approve(qspb.address, pool.maxTotalStake, {from : staker});
        await qspb.stakeFunds(poolId, pool.maxTotalStake, {from : staker});

        // test case
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
     * Tests that there is no fail and no transition when the pool is not violated and
     * it did not expire.
     */
    it("4.1 if not expired and not violated, max stake not reached, stay in this state and do not fail",
      async function() {
        const toStake = 14;
        await token.approve(qspb.address, toStake, {from : staker});
        await qspb.stakeFunds(poolId, toStake, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Tests that there is no fail and no transition when the pool is not violated and
     * it did not expire.
     */
    it("4.13 if not expired and not violated, max stake reached, fail",
      async function() {
        // additional setup
        await token.approve(qspb.address, pool.maxTotalStake, {from : staker});
        await qspb.stakeFunds(poolId, pool.maxTotalStake, {from : staker});

        // test case
        const toStake = 14;
        await token.approve(qspb.address, toStake, {from : staker});
        Util.assertTxFail(qspb.stakeFunds(poolId, toStake, {from : staker}));
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets
     * to state ViolatedFunded.
     */
    it("4.5 if not expired and violated, max stake not reached, move to state 5",
      async function() {
        await policy.updateStatus(true);
        const toStake = 6;
        await token.approve(qspb.address, toStake, {from : staker});
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it and checks that the pool gets
     * to state ViolatedFunded after max stake has been reached.
     */
    it("4.5 if not expired and violated, max stake reached, move to state 5",
      async function() {
        // additional setup to reach max stake
        await token.approve(qspb.address, pool.maxTotalStake, {from : staker});
        await qspb.stakeFunds(poolId, pool.maxTotalStake, {from : staker});
        
        // test case
        await policy.updateStatus(true);
        const toStake = 6;
        await token.approve(qspb.address, toStake, {from : staker});
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, toStake, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });
});
