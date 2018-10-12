const QSPb = artifacts.require('QSPb');
const LinkedListLib = artifacts.require('LinkedListLib');
const Registry = artifacts.require('Registry');

module.exports = function(deployer, network, accounts) {
  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QSPb))
    .then(() => deployer.deploy(Registry))
    .then(() => deployer.deploy(QSPb, Registry.address));
};
