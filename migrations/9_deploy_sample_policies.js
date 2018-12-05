const CandidateContract = artifacts.require('test/CandidateContract');
const ZeroBalancePolicy = artifacts.require('policies/ZeroBalancePolicy');
const TrivialBackdoorPolicy = artifacts.require('policies/TrivialBackdoorPolicy');
const CandidateToken = artifacts.require('test/CandidateToken');
const TotalSupplyNotExceededPolicy = artifacts.require('policies/TotalSupplyNotExceededPolicy');
const DemocraticViolationPolicy = artifacts.require('policies/DemocraticViolationPolicy');
const Registry = artifacts.require('test/Registry');
const TCROpinionPolicy = artifacts.require('policies/TCROpinionPolicy');
const StateNotChangedPolicy = artifacts.require('policies/StateNotChangedPolicy');
const AlwaysViolatedPolicy = artifacts.require('policies/AlwaysViolatedPolicy');
const NeverViolatedPolicy = artifacts.require('policies/NeverViolatedPolicy');

module.exports = function(deployer, network) {
  if (network === 'development') {
    const balance = 100;
    deployer.deploy(CandidateContract, balance)
      .then(() => deployer.deploy(ZeroBalancePolicy))
      .then(() => deployer.deploy(DemocraticViolationPolicy, 2, CandidateContract.address))
      .then(() => deployer.deploy(TrivialBackdoorPolicy))
      .then(() => deployer.deploy(CandidateToken))
      .then(() => deployer.deploy(TCROpinionPolicy, 2, CandidateToken.address, Registry.address))
      .then(() => deployer.deploy(TotalSupplyNotExceededPolicy, 0))
      .then(() => deployer.deploy(StateNotChangedPolicy, 0))
      .then(() => deployer.deploy(AlwaysViolatedPolicy))
      .then(() => deployer.deploy(NeverViolatedPolicy));
  }
};
