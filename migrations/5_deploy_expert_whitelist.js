const ExpertWhitelist = artifacts.require('contracts/ExpertWhitelist');

module.exports = function(deployer, network, accounts) {

  if (network === "development") {
    let admin = accounts[1];
    deployer.deploy(ExpertWhitelist, admin);
  }
};
