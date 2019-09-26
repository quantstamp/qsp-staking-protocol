/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));

function toEther (n) {
  return web3.utils.toWei(String(n), "ether");
}

function daysToSeconds(n) {
  return (new BigNumber(n)).times(24).times(3600);
}

async function assertTxFail (promise) {
  let txFailed = false;
  try {
    const result = await promise;
    txFailed = parseInt(result.receipt.status) === 0;
  } catch (err) {
    txFailed = (err.message.startsWith("VM Exception while processing transaction: revert"));
  }
  assert.isTrue(txFailed);
}

async function mineOneBlock () {
  await new Promise(resolve => web3.currentProvider.send({
    jsonrpc: '2.0',
    method: 'evm_mine',
    params: [],
    id: 0,
  }, resolve));
}

async function mineNBlocks (n) {
  for (let i = 0; i < n; i++) {
    await mineOneBlock();
  }
}

async function balanceOf (token, user) {
  return (await token.balanceOf(user)).toNumber();
}

async function getState (qspb, poolId) {
  return (await qspb.getPoolState(poolId)).toNumber();
}

async function balanceOfRaw (token, user) {
  return await token.balanceOf(user);
}

async function getBlockNumber () {
  return await web3.eth.getBlockNumber();
}

async function instantiatePool(qspb, poolParams) {
  await qspb.createPool(poolParams.candidateContract.address,
    poolParams.contractPolicy.address,
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
    {from: poolParams.owner});
}

async function assertEntirePoolState(poolParams, balanceOfQspb, quantstampStakingData) {
  assert.equal(poolParams.candidateContract.address, await quantstampStakingData.getPoolCandidateContract(poolParams.index));
  assert.equal(poolParams.contractPolicy.address, await quantstampStakingData.getPoolContractPolicy(poolParams.index));
  assert.equal(poolParams.owner, await quantstampStakingData.getPoolOwner(poolParams.index));
  assert.equal(poolParams.maxPayoutQspWei.toNumber(), (await quantstampStakingData.getPoolMaxPayoutQspWei(poolParams.index)).toNumber());
  assert.equal(poolParams.minStakeQspWei.toNumber(), (await quantstampStakingData.getPoolMinStakeQspWei(poolParams.index)).toNumber());
  assert.equal(poolParams.depositQspWei.toNumber(), (await quantstampStakingData.getPoolDepositQspWei(poolParams.index)).toNumber());
  assert.equal(poolParams.bonusExpertFactor.toNumber(), (await quantstampStakingData.getPoolBonusExpertFactor(poolParams.index)).toNumber());
  assert.equal(poolParams.bonusFirstExpertFactor.toNumber(), (await quantstampStakingData.getPoolBonusFirstExpertFactor(poolParams.index)).toNumber());
  assert.equal(poolParams.firstExpertStaker, await quantstampStakingData.getPoolFirstExpertStaker(poolParams.index));
  assert.equal(poolParams.payPeriodInBlocks.toNumber(), (await quantstampStakingData.getPoolPayPeriodInBlocks(poolParams.index)).toNumber());
  assert.equal(poolParams.minStakeTimeInBlocks.toNumber(), (await quantstampStakingData.getPoolMinStakeTimeInBlocks(poolParams.index)).toNumber());
  assert.equal(poolParams.timeoutInBlocks.toNumber(), (await quantstampStakingData.getPoolTimeoutInBlocks(poolParams.index)).toNumber());
  assert.equal(poolParams.timeOfStateInBlocks.toNumber(), (await quantstampStakingData.getPoolTimeOfStateInBlocks(poolParams.index)).toNumber());
  assert.equal(poolParams.urlOfAuditReport, await quantstampStakingData.getPoolUrlOfAuditReport(poolParams.index));
  assert.equal(poolParams.state, await quantstampStakingData.getPoolState(poolParams.index));
  assert.equal(poolParams.totalStakeQspWei.toNumber(), (await quantstampStakingData.getPoolTotalStakeQspWei(poolParams.index)).toNumber());
  assert.equal(poolParams.poolSizeQspWei.toNumber(), (await quantstampStakingData.getPoolSizeQspWei(poolParams.index)).toNumber());
  assert.equal(poolParams.stakeCount.toNumber(), (await quantstampStakingData.getPoolStakeCount(poolParams.index)).toNumber());
  assert.equal(poolParams.poolName, await quantstampStakingData.getPoolName(poolParams.index));
  assert.equal(poolParams.maxTotalStake, (await quantstampStakingData.getPoolMaxTotalStakeQspWei(poolParams.index)).toNumber());
  assert.equal(balanceOfQspb.toNumber(), (await quantstampStakingData.balanceQspWei.call()));
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  toEther : toEther,
  toQsp : toEther,
  daysToSeconds: daysToSeconds,
  assertTxFail : assertTxFail,
  getState: getState,
  getBlockNumber: getBlockNumber,
  mineOneBlock: mineOneBlock,
  mineNBlocks: mineNBlocks,
  balanceOf: balanceOf,
  balanceOfRaw: balanceOfRaw,
  instantiatePool: instantiatePool,
  assertEntirePoolState: assertEntirePoolState,
  sleep: sleep,
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000'
};
