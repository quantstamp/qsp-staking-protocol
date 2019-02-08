const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));

function toEther (n) {
  return web3.utils.toWei(String(n), "ether");
}

function daysToSeconds(n) {
  return (new BigNumber(n)).mul(24).mul(3600);
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

module.exports = {
  toEther : toEther,
  toQsp : toEther,
  daysToSeconds: daysToSeconds,
  assertTxFail : assertTxFail,
  getState: getState,
  mineOneBlock: mineOneBlock,
  mineNBlocks: mineNBlocks,
  balanceOf: balanceOf,
  balanceOfRaw: balanceOfRaw,
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000'
};
