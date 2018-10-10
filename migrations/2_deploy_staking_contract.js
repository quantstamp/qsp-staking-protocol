const QSPb = artifacts.require('QSPb');
const LinkedListLib = artifacts.require('LinkedListLib');
const QSPbtcr = artifacts.require('Registry');

module.exports = function(deployer, network, accounts) {
  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QSPb))
    .then(() => deployer.deploy(QSPbtcr))
    .then(() => deployer.deploy(QSPb, QSPbtcr.address));
};
