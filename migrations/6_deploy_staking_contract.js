/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

const QuantstampStaking = artifacts.require('QuantstampStaking');
const QuantstampStakingData = artifacts.require('QuantstampStakingData');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampStakingRegistry = artifacts.require('registries/WhitelistExpertRegistry');
const utils = require('./utils');
const truffle = require('../truffle.js');

module.exports = function(deployer, network) {
  if (!utils.canDeploy(network, 'QuantstampStaking')) {
    return;
  }

  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  const stakingDataAddress = utils.contractAddress(network, 'QuantstampStakingData', QuantstampStakingData);
  const registryContractAddress = utils.contractAddress(network, 'WhitelistExpertRegistry', QuantstampStakingRegistry);
  deployer.deploy(QuantstampStaking, tokenContractAddress, registryContractAddress, stakingDataAddress)
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'QuantstampStaking',
      QuantstampStaking.address
    ))
    .then(async() => await utils.callMethod({
      network, // whitelisting logic contract in data contract
      contractName: 'QuantstampStakingData',
      methodName: 'setWhitelistAddress',
      methodArgsFn: () => ([
        QuantstampStaking.address
      ]),
      sendArgs: {
        from: truffle.networks[network].account,
        gasPrice: truffle.networks[network].gasPrice,
        gas: truffle.networks[network].gas
      }
    }));
};
