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


contract('TransitionState4.js (NotViolatedFunded): check transitions', function(accounts) {

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
  let assertPoolState = async function(id, state) {
    assert.equal(await Util.getState(qspb, id), state);
  };

  /*
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the NotViolatedFunded state.
   */
  beforeEach(async function() {

    // create QSP token
    token = await QuantstampToken.new(qspAdmin, {from : owner});
    await token.enableTransfer({from : owner});

    // create staking protocol
    let registry = await ExpertRegistry.new({from : owner});
    data = await QuantstampStakingData.new(token.address, {from : owner});
    qspb = await QuantstampStaking.new(token.address, registry.address, data.address, {from: owner});
    await data.addWhitelistAddress(qspb.address, {from : owner});

    // create policy
    policy = await Policy.new();
    pool.contractPolicy = policy.address;

    // give tokens to staker
    await token.transfer(staker, pool.minStakeQspWei.times(10), {from : owner});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(qspb, pool);

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
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired after depositing 0.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired after depositing non-zero funds.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await token.approve(qspb.address, 13, {from : stakeholder});
        await qspb.depositFunds(poolId, 13, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy after violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(2));
        await token.approve(qspb.address, 13, {from : stakeholder});
        await policy.updateStatus(true);
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, 13, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, stay in this state and do not fail",
      async function() {
        await token.approve(qspb.address, 13, {from : stakeholder});
        await qspb.depositFunds(poolId, 13, {from : stakeholder});
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await token.approve(qspb.address, 13, {from : stakeholder});
        // todo(mderka): uncommented when the modifier in the smart contract is removed
        // await qspb.depositFunds(poolId, 13, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function withdrawDepost
   */
  describe("withdrawDeposit", async function() {

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await policy.updateStatus(true);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no transition and fail when the pool is not violated
     * and did not time out.
     */
    it("if the max staking time did not elapse and the policy is not violated, fail",
      async function() {
        // todo(mderka): uncomment when the fail is present
        // Util.assertTxFail(qspb.withdrawDeposit(poolId, {from : stakeholder}));
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy not violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        // todo(mderka): uncomment when the transition bug is removed
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await policy.updateStatus(true);
        await qspb.withdrawStake(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, fail transaction",
      async function() {
        Util.assertTxFail(qspb.withdrawStake(poolId, {from : staker}));
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
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
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.withdrawInterest(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await policy.updateStatus(true);
        // todo(mderka): uncomment when fixed
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Validates that the pool has enough deposit to pay the staker including other stakers.
     * Without violating the policy or reaching the maximum staking time, it withdraws the
     * insterest and verifies the the pool remained in NonViolatedFunded state.
     */
    it("max staking time did not elapse, policy is not violated, enough to pay multiple interests, stay in 4",
      async function() {
        let payout = await data.getPoolMaxPayoutQspWei(poolId);
        let depositLeft = await data.getPoolDepositQspWei(poolId);
        // validate that the precondition of the test is safely met
        assert.isTrue(depositLeft.gte(payout.times(3)));
        await assertPoolState(poolId, PoolState.NotViolatedFunded);

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
    it("max staking time did not elapse, policy is not violated, not enough to pay any interest, go to 6",
      async function() {
        // keep withdrawing until there is not enough deposit left to make another withdraw
        let payout = await data.getPoolMaxPayoutQspWei(poolId);
        let depositLeft = await data.getPoolDepositQspWei(poolId);
        await Util.mineNBlocks(pool.payPeriodInBlocks);
        while (depositLeft.gte(payout)) {
          await qspb.withdrawInterest(poolId, {from : staker});
          depositLeft = await data.getPoolDepositQspWei(poolId);
        }
        // validate the precondition state
        depositLeft = await data.getPoolDepositQspWei(poolId);
        assert.isFalse(depositLeft.gte(payout));
        await assertPoolState(poolId, PoolState.NotViolatedFunded);

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
    it("max staking time did not elapse, policy is not violated, enough to pay single interest, go to 2",
      async function() {
        let payout = await data.getPoolMaxPayoutQspWei(poolId);
        let depositLeft = await data.getPoolDepositQspWei(poolId);
        await Util.mineNBlocks(pool.payPeriodInBlocks);
        while (depositLeft.gt(payout.times(2))) {
          await qspb.withdrawInterest(poolId, {from : staker});
          depositLeft = await data.getPoolDepositQspWei(poolId);
        }
        // validation the precondition
        depositLeft = await data.getPoolDepositQspWei(poolId);
        assert.isTrue(depositLeft.gte(payout));
        assert.isTrue(payout.times(2).gt(depositLeft));

        await qspb.withdrawInterest(poolId, {from : staker});
        // todo(mderka) uncomment when fixed
        // await assertPoolState(poolId, PoolState.NotViolatedUnderfunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        // todo(mderka): uncomment when fixed
        // await qspb.withdrawInterest(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when this does not fail
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await policy.updateStatus(true);
        // todo(mderka): uncomment when this does not fail
        // await qspb.withdrawClaim(poolId, {from : stakeholder});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, fail",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
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
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        // todo(mderka): uncomment when fixed
        // await qspb.checkPolicy(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await policy.updateStatus(true);
        await qspb.checkPolicy(poolId, {from : staker});
        // todo(mderka): uncomment when the transition bug fixed
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, stay in this state and fail loud",
      async function() {
        Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
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
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await token.approve(qspb.address, 27, {from : staker});
        // todo(mderka): uncomment when this does not fail
        // await qspb.stakeFunds(poolId, 27, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(2));
        await policy.updateStatus(true);
        await token.approve(qspb.address, 31, {from : staker});
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, 31, {from : staker});
        // await assertPoolState(poolId, PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no fail and no transition when the pool is not violated and
     * it did not expire.
     */
    it("if the max staking time did not elapse and the policy is not violated, stay in this state and do not fail",
      async function() {
        await token.approve(qspb.address, 14, {from : staker});
        await qspb.stakeFunds(poolId, 14, {from : staker});
        await assertPoolState(poolId, PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets
     * to state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await token.approve(qspb.address, 6, {from : staker});
        // todo(mderka): uncomment when the modifier is removed
        // await qspb.stakeFunds(poolId, 6, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });
});

