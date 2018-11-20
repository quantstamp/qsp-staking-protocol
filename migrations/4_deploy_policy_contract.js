const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('test/ZeroBalancePolicy');
const TrivialBackdoorPolicy = artifacts.require('test/TrivialBackdoorPolicy');
const TCRContainsEntryPolicy = artifacts.require('test/TCRContainsEntryPolicy');
const CandidateToken = artifacts.require('test/CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('test/TotalSupplyNotExceededPolicy');
const DemocraticViolationPolicy = artifacts.require('test/DemocraticViolationPolicy');

module.exports = function(deployer) {
  //TODO: should these only be dployed on the development environment? they're only samples
  const balance = 100;
  deployer.deploy(CandidateContract, balance)
    .then(() => deployer.deploy(ZeroBalancePolicy))
    .then(() => deployer.deploy(DemocraticViolationPolicy, 2, CandidateContract.address));
  deployer.deploy(TrivialBackdoorPolicy);
  deployer.deploy(TCRContainsEntryPolicy);
  deployer.deploy(CandidateToken, 2, "CandidateToken", "CAN");
  deployer.deploy(TotalSupplyNotExceededPolicy, 2);
};
