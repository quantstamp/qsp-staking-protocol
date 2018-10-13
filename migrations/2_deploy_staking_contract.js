const QuantstampStaking = artifacts.require('QuantstampStaking');
const LinkedListLib = artifacts.require('LinkedListLib');
const Registry = artifacts.require('Registry');

module.exports = function(deployer, network, accounts) {
  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QuantstampStaking))
    .then(() => deployer.deploy(Registry))
    .then(() => deployer.deploy(QuantstampStaking, Registry.address));
};
