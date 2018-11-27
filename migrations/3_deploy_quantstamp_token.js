const QuantstampToken = artifacts.require('test/QuantstampToken');

module.exports = function(deployer, network, accounts) {

  if (network === "development") {
    let admin = accounts[1];
    deployer.deploy(QuantstampToken, "0xDD");// admin);
  }
};
