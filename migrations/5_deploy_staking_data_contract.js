/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

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
