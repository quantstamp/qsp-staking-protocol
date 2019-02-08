const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('QuantstampToken');
const RegistryWrapper = artifacts.require('TokenCuratedRegistry');
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
  // todo(mderka) when complete, verify that this is needed
  // const staker = accounts [1]; 
  const stakeholder = accounts[2];
  const qspAdmin = accounts[3];
  const nonZeroAddress = accounts[4];
  const pool = {
    'candidateContract' : nonZeroAddress,
    'contractPolicy' : Util.ZERO_ADDRESS,
    'owner' : stakeholder,
    'maxPayoutQspWei' : new BigNumber(Util.toQsp(100)),
    'minStakeQspWei' : new BigNumber(Util.toQsp(400)),
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
  
  /* Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the initialized state. */
  beforeEach(async function() {
    // create QSP token
    token = await QuantstampToken.new(qspAdmin, {from : owner});
    await token.enableTransfer({from : owner});
    
    // create staking protocol
    let wrapper = await RegistryWrapper.new(nonZeroAddress);
    qspb = await QuantstampStaking.new(token.address, wrapper.address, {from: owner});

    // create policy
    policy = await Policy.new();
    pool.contractPolicy = policy.address;

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(qspb, pool);
  });

  
  describe("depositFunds in state Initialized", async function() {

    /* Waits for the timeout and makes a deposit while policy is not violated. 
     * Then verifies that the pool was cancelled regardless of the deposit amount. */
    it("if deposit >=< maxPayout and timeout happened, switch to Cancelled", 
      async function() {
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

        // issue three approvals at once
        let leftToDeposit = pool.maxPayoutQspWei - pool.depositQspWei;
        await token.approve(qspb.address, 3 * leftToDeposit, {from : stakeholder});

        await qspb.depositFunds(poolId + 1, leftToDeposit - 1, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId + 1), PoolState.Cancelled);

        await qspb.depositFunds(poolId + 2, leftToDeposit, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId + 2), PoolState.Cancelled);

        await qspb.depositFunds(poolId + 3, leftToDeposit + 1, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId + 3), PoolState.Cancelled);
      }
    );

    /* Waits for the timeout - 1  block and makes a deposit while policy is not violated.
     * Then verifies that the pool was not cancelled. Then repeats (mining one extra block)
     * and verifies that the pool was cancelled. */
    it("Edge case for switching the pool to cancelled state",
      async function() {
        await Util.mineNBlocks(pool.timeoutInBlocks - 1);
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        // this deposit will mine one more block
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        // todo(mderka): functionality not implemented, uncomment when it is
        // assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );

    /* Works without timeout and with policy that is not violated. It deposits
     * funds that insufficitient to cover the payout, then adds more and in each
     * step verifies that the state remained Initialized. */
    it("both deposit >=< maxPayout stay in this state if timeout did not happen",
      async function() {
        await qspb.depositFunds(poolId, 0, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Initialized);

        // approve all the possible transfers at once
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

    /* Violates the policy, calls the function and checks that the transaction failed. */
    it("deposit >=< maxPayout revert when the policy is violated",
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

  describe("withdrawDeposit in state Initialized", async function() {

    /* Makes a deposit and then withdraws it. Then verifies that the pool was cancelled.*/
    it("always switch to Cancelled", 
      async function() {
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );
    
    /* Makes no deposit and then withdraws it. Then verifies that the pool was cancelled.*/
    it("switch to Cancelled even if the policy is violated", async function() {
        await policy.updateStatus(true);
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
    });

    it("in case for timeout, should also swith into Cancelled",
      async function() {
        await Util.mineNBlocks(pool.timeoutInBlocks.add(5));
        await qspb.withdrawDeposit(poolId, {from : stakeholder});
        assert.equal(await Util.getState(qspb, poolId), PoolState.Cancelled);
      }
    );
  });
  
  describe("Other unimplemented tests", async function() {
    it("withdrawStake: if the policy is violated, switch to cancelled", async function() {});
    it("withdrawStake: if timeout happened, switch to cancelled", async function() {});
    it("withdrawStake: if timeout did not happen and policy is not violated, remain in this state", async function() {});
    
    it("withdrawInterest: call is not allowed", async function() {});
    it("withdrawClaim: call is not allowed", async function() {});
    
    
    it("checkPolicy: If policy is violated switch state to cancelled", async function() {});
    it("checkPolicy: If policy is NOT violated, do not change the state", async function() {});
    
    it("updatePoolState: do not change the state", async function() {});

    it("stakeFunds: cancel if timeout happened", async function() {});
    it("stakeFunds: cancel if policy is violated", async function() {});
    it("stakeFunds: if the sum of stakes is >= minStake and deposit is large enough, transition to ViolatedFunded.", async function() {});
    it("stakeFunds: if the sum of stakes is >= minStake and deposit is not large enough, transition to NotViolatedInderfunded.", async function() {});

  });
});
