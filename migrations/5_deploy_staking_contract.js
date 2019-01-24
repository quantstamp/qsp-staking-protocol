const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('WhitelistExpertRegistry');
const utils = require('./utils');

module.exports = function(deployer, network) {
  if (!utils.canDeploy(network, 'QuantstampStaking')) {
    return;
  }

  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  const registryContractAddress = utils.contractAddress(network, 'WhitelistExpertRegistry', QuantstampStakingRegistry);
  deployer.deploy(QuantstampStaking, tokenContractAddress, registryContractAddress)
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'QuantstampStaking',
      QuantstampStaking.address
    ));
};