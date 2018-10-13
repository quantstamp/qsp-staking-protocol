const QuantstampStakingRegistry = artifacts.require('Registry');

module.exports = function(deployer, network, accounts) {

  if (network === "development") {
    deployer.deploy(QuantstampStakingRegistry);
  }
};
