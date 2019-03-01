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

const policyStatuses = [
  true,
  false
];


policyStatuses.forEach(policyStatus => contract(`ViolatedFundedState.js: policy.isViolated = ${policyStatus}`, function(accounts) {
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
    'minStakeTimeInBlocks' : new BigNumber(10),
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
   * Make a new instance of QuantstampStaking, QSP Token, and create a pool
   * that will be in the ViolatedFunded state.
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

    // update the policy status, to make sure the behaviour does not depend
    // on policy status after the pool state is already violated
    await policy.updateStatus(policyStatus);

    // verify the initial state
    await assertPoolState(poolId, PoolState.ViolatedFunded);
  });

  /*
   * Tests for function withdrawClaim.
   */
  describe("withdrawClaim", async function() {
    /*
     * Tests that the call is allowed and after executing it the pool remains in the same state.
     */
    it("5.1 withdraw the assurance claim and stay in same state",
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
    it("5.2 call is not allowed",
      async function() {
        await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
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
    it("5.2 call is not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawDeposit(poolId, {from : stakeholder}));
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
    it("5.2 call is not allowed",
      async function() {
        await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
        Util.assertTxFail(qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker}));
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
    it("5.2 call is not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawStake(poolId, {from : staker}));
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
    it("5.2 call is not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawInterest(poolId, {from : staker}));
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
        await policy.updateStatus(true);
        await qspb.checkPolicy(poolId, {from : owner});
        await assertPoolState(poolId, PoolState.ViolatedFunded);
      }
    );
  });
}));
