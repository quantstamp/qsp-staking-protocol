const QuantstampStakingRegistry = artifacts.require('test/Registry');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(QuantstampStakingRegistry);
  }
};
