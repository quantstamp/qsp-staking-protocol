const QuantstampStaking = artifacts.require('QuantstampStaking');
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


contract('TransitionState3.js (NotViolatedFunded): check transitions', function(accounts) {

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
   * that will be in the NotViolatedFunded state. 
   */
  beforeEach(async function() {

    // create QSP token
    token = await QuantstampToken.new(qspAdmin, {from : owner});
    await token.enableTransfer({from : owner});
    
    // create staking protocol
    let registry = await ExpertRegistry.new({from : owner});
    qspb = await QuantstampStaking.new(token.address, registry.address, {from: owner});

    // create policy
    policy = await Policy.new();
    pool.contractPolicy = policy.address;

    // give tokens to staker
    await token.transfer(staker, pool.minStakeQspWei.times(10), {from : owner});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(qspb, pool);
  });

  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {

    // "if the timout happened and the policy is not violated, switch to state 7"
    // "if the timout happened and the policy is violated, switch to state 7"
    // "if the timeut did not happen and the policy is not violated, remain in this state"
    // "if the timout did not happen and the policy is violated, switch to state 5"
    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired after depositing 0.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired after depositing non-zero funds.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await qspb.approve(qspb.address, 13, {from : stakeholder});
        await qspb.depositFunds(poolId, 13, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
      }
    );

    /*
     * Expires the policy after violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(2));
        await qspb.approve(qspb.address, 13, {from : stakeholder});
        await policy.updateStatus(true);
        await qspb.depositFunds(poolId, 13, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, stay in this state and do not fail",
      async function() {
        await qspb.approve(qspb.address, 13, {from : stakeholder});
        await qspb.depositFunds(poolId, 13, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.approve(qspb.address, 13, {from : stakeholder});
        await qspb.depositFunds(poolId, 13, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function withdrawDepost
   */
  describe("withdrawDeposit", async function() {

    // "if the max staking time elapsed and the policy is not violated, allow the call and move to state 7"
    // "if the max staking time did not elapse and the policy is not violated, reject the call"
    // "if the max staking time elapsed and the policy is violated, move to state 7"
    // "if the max staking time did not elapse and the policy is violated, allows the call and switch to state 5"
    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated
     * and did not time out.
     */
    it("if the max staking time did not elapse and the policy is not violated, stay in this state and do not fail",
      async function() {
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedFunded);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.ViolatedFunded);
      }
    );
  });
  
  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {

    // "if the max staking time elapsed and the policy is not violated, allow the call and move to state 7"
    // "if the max staking time did not elapse and the policy is not violated, reject the call"
    // "if the max staking time elapsed and the policy is violated, move to state 7"
    // "if the max staking time did not elapse and the policy is violated, switch to state 5 (and do not refund the stake)"

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is no transition and no fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, fail transaction",
      async function() {
        Util.assertTxFail(qspb.withdrawStake(poolId, {from : staker}));
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await qspb.withdrawStake(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.ViolatedFunded);
      }
    );
  });
  

  /*
   * Tests for function withdrawInterest
   */
  describe("withdrawInterest", async function() {

  });
  

  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {

    // "if the max staking time elapsed and the policy is not violated, allow the call and move to state 7"
    // "if the max staking time elapsed and the policy is violated, move to state 7"
    // "if the max staking time did not elapse and the policy is not violated, reject the call"
    // "if the max staking time did not elapse and the policy is violated, switch to state 5 and allow the claim"

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks);
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        await qspb.withdrawClaim(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
      }
    );

    /*
     * Tests that there is a loud fail when the pool is not violated.
     */
    it("if the max staking time did not elapse and the policy is not violated, fail",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedFunded);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.ViolatedFunded);
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
        await qspb.checkPolicy(poolId, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.ViolatedFunded);
      }
    );
  });


  /*
   * Tests for function stakeFunds
   */
  describe("stakeFunds", async function() {

    // "if the max staking time elapsed and the policy is not violated, allow the call and move to state 7"
    // "if the max staking time elapsed and the policy is violated, move to state 7"
    // "if the max staking time did not elapse and the policy is not violated, stay in this state"
    // "if the max staking time did not elapse and the policy is violated, switch to state 5"

    /*
     * Expires the policy without violating it anc checks that the pool gets to
     * state PolicyExpired.
     */
    it("if the max staking time elapsed and the policy is not violated, move to state 7",
      async function() {
        await Util.mineNBlocks(pool.minStakeTimeInBlocks.sub(1));
        await token.approve(qspb.address, 27, {from : staker});
        await qspb.stakeFunds(poolId, 27, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        await qspb.stakeFunds(poolId, 31, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.PolicyExpired);
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
        assert.equal(await Util.getState(qspb, poolId), PoolState.NotViolatedFunded);
      }
    );

    /*
     * Violates the policy without expiring the pool it anc checks that the pool gets to
     * state ViolatedFunded.
     */
    it("if the max staking time did not elapse and the policy is violated, move to state 5",
      async function() {
        await policy.updateStatus(true);
        await token.approve(qspb.address, 6, {from : staker});
        await qspb.stakeFunds(poolId, 6, {from : staker});
        assert.equal(await Util.getState(qspb, poolId), PoolState.ViolatedFunded);
      }
    );
  });
});
