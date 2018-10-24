const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('test/Registry');
const utils = require('./utils');

module.exports = function(deployer, network) {
  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  const registryContractAddress = utils.registryAddress(network, QuantstampStakingRegistry);
  deployer.deploy(QuantstampStaking, tokenContractAddress, registryContractAddress);
};
