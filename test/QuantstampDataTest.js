const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const QuantstampToken = artifacts.require('QuantstampToken');
const WhitelistExpertRegistry = artifacts.require('WhitelistExpertRegistry');
const ZeroBalancePolicy = artifacts.require('ZeroBalancePolicy');
const CandidateContract = artifacts.require('CandidateContract');
const Util = require('./util.js');
const BigNumber = require('bignumber.js');

contract('QuantstampStakingData', function(accounts) {
  const owner = accounts[0];
  const qspAdmin = accounts[1];
  const poolOwner = accounts[3];
  const poolOwnerBudget = new BigNumber(Util.toQsp(100000));

  // vars needed for creating pool
  const maxPayoutQspWei = new BigNumber(Util.toQsp(100));
  const minStakeQspWei = new BigNumber(Util.toQsp(10));
  const depositQspWei = new BigNumber(Util.toQsp(10));
  const bonusExpertFactor = new BigNumber(3);
  const bonusFirstExpertFactor = new BigNumber(5);
  const payPeriodInBlocks = new BigNumber(5);
  const minStakeTimeInBlocks = new BigNumber(10);
  const timeoutInBlocks = new BigNumber(5);
  const urlOfAuditReport = "URL";
  const poolName = "myPool";
  const defaultMaxTotalStake = new BigNumber(Util.toQsp(100000));
  const candidateContractBalance = new BigNumber(Util.toEther(100));

  let quantstampStakingData;
  let qspb;
  let quantstampToken;
  let candidateContract;
  let quantstampRegistry;
  let contractPolicy;

  describe("Whitelisting tests", function() {
    beforeEach(async function(){
      quantstampToken = await QuantstampToken.new(qspAdmin, {from: owner});
      quantstampStakingData = await QuantstampStakingData.new(quantstampToken.address);

      quantstampRegistry = await WhitelistExpertRegistry.new();

      await quantstampToken.enableTransfer({from : owner});
      await quantstampToken.transfer(poolOwner, poolOwnerBudget, {from : owner});

      candidateContract = await CandidateContract.new(candidateContractBalance);
      contractPolicy = await ZeroBalancePolicy.new();

      qspb = await QuantstampStaking.new(quantstampToken.address, quantstampRegistry.address,
        quantstampStakingData.address);

      await quantstampToken.approve(qspb.address, poolOwnerBudget, {from : poolOwner});
    });

    it("should not create a pool if caller is not whitelisted", async function() {
      await Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, defaultMaxTotalStake, {from: poolOwner}));
    });    

    it("should not create a pool if caller was whitelisted but no is longer whitelisted", async function() {
      await quantstampStakingData.setWhitelistAddress(qspb.address);
      await quantstampStakingData.clearWhitelistAddress();
      await Util.assertTxFail(qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, defaultMaxTotalStake, {from: poolOwner}));
    });

    it("should create a pool if caller is whitelisted", async function() {
      await quantstampStakingData.setWhitelistAddress(qspb.address);
      await qspb.createPool(candidateContract.address, contractPolicy.address, maxPayoutQspWei, minStakeQspWei,
        depositQspWei, bonusExpertFactor, bonusFirstExpertFactor, payPeriodInBlocks,
        minStakeTimeInBlocks, timeoutInBlocks, urlOfAuditReport, poolName, defaultMaxTotalStake, {from: poolOwner});
    });
  });
});
