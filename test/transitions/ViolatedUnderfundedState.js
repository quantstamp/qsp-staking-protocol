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


contract('ViolatedUnderfundedState.js: check transitions', function(accounts) {

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
    'depositQspWei' : new BigNumber(Util.toQsp(50)), // insufficient deposit
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
   * that will be in the ViolatedUnderfunded state.
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
    await token.transfer(staker, pool.minStakeQspWei.times(10), {from : owner});

    // create pool
    await token.transfer(stakeholder, pool.maxPayoutQspWei.times(10), {from : owner});
    await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
    await instantiatePool(pool);

    // make sufficient state (note that deposit is not sufficient)
    await token.approve(qspb.address, pool.minStakeQspWei, {from : staker});
    await qspb.stakeFunds(poolId, pool.minStakeQspWei, {from : staker});
    
    // manually violate the policy
    await policy.updateStatus(true);
    // force the transition into the desired state
    await qspb.checkPolicy(poolId);

    // verify the initial state
    await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
  });

  /*
   * Tests for function depositFunds.
   */
  describe("depositFunds", async function() {
    it("3.2 call not allowed",
      async function() {
        await token.approve(qspb.address, pool.depositQspWei, {from : stakeholder});
        Util.assertTxFail(qspb.depositFunds(poolId, pool.maxPayoutQspWei, {from : stakeholder}));
      }
    );
  });

  /*
   * Tests for function withdrawDepost
   */
  describe("withdrawDeposit", async function() {
    it("3.2 call not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawDeposit(poolId, {from : stakeholder}));
      }
    );
  });

  /*
   * Tests for function withdrawStake
   */
  describe("withdrawStake", async function() {
    it("3.1 remains in the same state",
      async function() {
        // TODO(amurashkin): uncomment once implemented
        // await qspb.withdrawStake(poolId, {from : staker});
        // await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );
  });


  /*
   * Tests for function withdrawInterest
   */
  describe("withdrawInterest", async function() {

    it("3.1 remains in the same state",
      async function() {
        // TODO(amurashkin): uncomment once implemented
        //await qspb.withdrawInterest(poolId, {from : staker});
        //await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );
  });


  /*
   * Tests for function withdrawClaim
   */
  describe("withdrawClaim", async function() {
    it("3.2 call not allowed",
      async function() {
        Util.assertTxFail(qspb.withdrawClaim(poolId, {from : stakeholder}));
      }
    );
  });

  /*
   * Tests for function checkPolicy
   */
  describe("checkPolicy", async function() {
    it("3.2 fails loud when not violated",
      async function() {
        await policy.updateStatus(false);
        Util.assertTxFail(qspb.checkPolicy(poolId, {from : staker}));
      }
    );

    it("3.2 remains in the same state when violated",
      async function() {
        await policy.updateStatus(true);
        await qspb.checkPolicy(poolId, {from : staker});
        await assertPoolState(poolId, PoolState.ViolatedUnderfunded);
      }
    );
  });

  /*
   * Tests for function stakeFunds
   */
  describe("stakeFunds", async function() {

    it("3.2 call not allowed",
      async function() {
        const toStake = 27;
        await token.approve(qspb.address, toStake, {from : staker});
        Util.assertTxFail(qspb.stakeFunds(poolId, toStake, {from : staker}));
      }
    );
  });
});
