const ExpertWhitelist = artifacts.require('contracts/ExpertWhitelist');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(ExpertWhitelist);
  }
};
