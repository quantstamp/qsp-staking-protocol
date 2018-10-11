const uri = "http://www.quantstamp.com/contract.sol";

function toEther (n) {
  return web3.toWei(n, "ether");
}

module.exports = {
  uri : uri,
  toEther : toEther,
  toQsp : toEther,
  oneEther : toEther(1),
  twoEther : toEther(2),
  threeEther : toEther(3),
  tenEther : toEther(10),
  hundredEther : toEther(100),
};

