const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const utils = require('./utils');

module.exports = function(deployer, network) {
  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  deployer.deploy(QuantstampStaking, tokenContractAddress);
};
