const ExpertWhitelist = artifacts.require('contracts/ExpertWhitelist');

module.exports = function(deployer, network, accounts) {

  if (network === "development") {
    deployer.deploy(ExpertWhitelist);
  }
};
