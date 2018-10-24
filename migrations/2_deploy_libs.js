const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(DLL);
    deployer.deploy(AttributeStore);
    deployer.link(DLL, Voting);
    deployer.link(AttributeStore, Voting);
    deployer.deploy(Voting);
  }
};
