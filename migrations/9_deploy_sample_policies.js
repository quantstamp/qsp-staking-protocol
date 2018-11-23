const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('test/ZeroBalancePolicy');
const TrivialBackdoorPolicy = artifacts.require('test/TrivialBackdoorPolicy');
const CandidateToken = artifacts.require('test/CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('test/TotalSupplyNotExceededPolicy');
const DemocraticViolationPolicy = artifacts.require('test/DemocraticViolationPolicy');

module.exports = function(deployer, network) {
  if (network === 'development') {
    const balance = 100;
    deployer.deploy(CandidateContract, balance)
      .then(() => deployer.deploy(ZeroBalancePolicy))
      .then(() => deployer.deploy(DemocraticViolationPolicy, 2, CandidateContract.address));
    deployer.deploy(TrivialBackdoorPolicy);
    deployer.deploy(CandidateToken);
    deployer.deploy(TotalSupplyNotExceededPolicy, 0);    
  }
};
