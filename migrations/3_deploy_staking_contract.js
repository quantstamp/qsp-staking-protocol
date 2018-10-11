const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network, accounts) {
  if (!utils.canDeploy(network, 'QuantstampStaking')) {
    return;
  }

  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  console.log('Token contract address:', tokenContractAddress);
      
  deployer.deploy(QuantstampStaking, tokenContractAddress);
};
