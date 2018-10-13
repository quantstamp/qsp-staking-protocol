const QuantstampStakingRegistry = artifacts.require('Registry');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(QuantstampStakingRegistry);
  }
};
