const WhitelistExpertRegistry = artifacts.require('WhitelistExpertRegistry');
const utils = require('./utils.js');

module.exports = function(deployer, network) {

  deployer.deploy(WhitelistExpertRegistry)
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'WhitelistExpertRegistry',
      WhitelistExpertRegistry.address
    ));
};
