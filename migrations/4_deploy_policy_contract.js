const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('test/ZeroBalancePolicy');
const TrivialBackdoorPolicy = artifacts.require('test/TrivialBackdoorPolicy');
const TCRContainsEntryPolicy = artifacts.require('test/TCRContainsEntryPolicy');

module.exports = function(deployer) {
  const balance = 100;
  deployer.deploy(CandidateContract, balance)
    .then(() => deployer.deploy(ZeroBalancePolicy));
  deployer.deploy(TrivialBackdoorPolicy);
  deployer.deploy(TCRContainsEntryPolicy);
};
