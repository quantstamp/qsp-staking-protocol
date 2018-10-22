const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));

function toEther (n) {
  return web3.toWei(n, "ether");
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
  await web3.currentProvider.send({
    jsonrpc: '2.0',
    method: 'evm_mine',
    params: [],
    id: 0,
  });
}

async function mineNBlocks (n) {
  for (let i = 0; i < n; i++) {
    await mineOneBlock();
  }
}

module.exports = {
  toEther : toEther,
  toQsp : toEther,
  assertTxFail : assertTxFail,
  mineOneBlock: mineOneBlock,
  mineNBlocks: mineNBlocks
};
