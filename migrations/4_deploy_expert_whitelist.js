/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

const WhitelistExpertRegistry = artifacts.require('registries/WhitelistExpertRegistry');
const utils = require('./utils.js');

module.exports = function(deployer, network) {

  deployer.deploy(WhitelistExpertRegistry)
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'WhitelistExpertRegistry',
      WhitelistExpertRegistry.address
    ));
};
