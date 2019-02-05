const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const utils = require('./utils');

module.exports = function(deployer, network) {
  if (!utils.canDeploy(network, 'QuantstampStakingData')) {
    return;
  }

  deployer.deploy(QuantstampStakingData)
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'QuantstampStakingData',
      QuantstampStakingData.address
    ));
};
