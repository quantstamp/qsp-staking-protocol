const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('test/ZeroBalancePolicy');
const TrivialBackdoorPolicy = artifacts.require('test/TrivialBackdoorPolicy');

module.exports = function(deployer) {
  const balance = 100;
  deployer.deploy(CandidateContract, balance)
    .then(() => deployer.deploy(ZeroBalancePolicy));
  deployer.deploy(TrivialBackdoorPolicy);
};
