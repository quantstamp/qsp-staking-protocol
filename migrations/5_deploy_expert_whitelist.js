const WhitelistExpertRegistry = artifacts.require('contracts/WhitelistExpertRegistry');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(WhitelistExpertRegistry);
  }
};
