const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));

function toEther (n) {
  return web3.toWei(n, "ether");
}

module.exports = {
  toEther : toEther,
  toQsp : toEther,
};

