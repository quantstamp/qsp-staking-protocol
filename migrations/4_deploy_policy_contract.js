const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('test/ZeroBalancePolicy');

module.exports = function(deployer) {
  const balance = 100;
  deployer.deploy(CandidateContract, balance)
    .then(() => deployer.deploy(ZeroBalancePolicy));
};
