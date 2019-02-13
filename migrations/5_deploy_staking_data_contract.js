const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const utils = require('./utils');

module.exports = function(deployer, network) {
  if (!utils.canDeploy(network, 'QuantstampStakingData')) {
    return;
  }
  
  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);

  deployer.deploy(QuantstampStakingData, tokenContractAddress)
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'QuantstampStakingData',
      QuantstampStakingData.address
    ));
};
