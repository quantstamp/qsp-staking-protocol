function toEther (n) {
  return web3.toWei(n, "ether");
}

module.exports = {
  toEther : toEther,
  toQsp : toEther,
};

