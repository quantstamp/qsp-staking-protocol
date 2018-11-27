const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('policies/ZeroBalancePolicy');
const TrivialBackdoorPolicy = artifacts.require('policies/TrivialBackdoorPolicy');
const CandidateToken = artifacts.require('test/CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('policies/TotalSupplyNotExceededPolicy');
const DemocraticViolationPolicy = artifacts.require('policies/DemocraticViolationPolicy');
const Registry = artifacts.require('test/Registry');
const TCROpinionPolicy = artifacts.require('policies/TCROpinionPolicy');

module.exports = function(deployer) {
  //TODO: should these only be dployed on the development environment? they're only samples
  const balance = 100;
  deployer.deploy(CandidateContract, balance)
    .then(() => deployer.deploy(ZeroBalancePolicy))
    .then(() => deployer.deploy(DemocraticViolationPolicy, 2, CandidateContract.address));
  deployer.deploy(TrivialBackdoorPolicy);
  deployer.deploy(CandidateToken);
  deployer.deploy(TotalSupplyNotExceededPolicy, 0);
  deployer.deploy(Registry)
    .then(() => deployer.deploy(TCROpinionPolicy, 2, CandidateToken.address, Registry.address));
};
