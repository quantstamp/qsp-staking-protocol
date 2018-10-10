const QuantstampStaking = artifacts.require('QuantstampStaking');
const LinkedListLib = artifacts.require('LinkedListLib');

module.exports = function(deployer, network, accounts) {
  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QuantstampStaking))
    .then(() => deployer.deploy(QuantstampStaking));
};
