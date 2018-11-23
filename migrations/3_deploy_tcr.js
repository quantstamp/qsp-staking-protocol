const fs = require('fs');
const utils = require('./utils.js');
const Registry = artifacts.require('test/Registry');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const tcrConfig = JSON.parse(fs.readFileSync('./tcr-config.json'));
const params = tcrConfig.paramDefaults;

module.exports = function(deployer, network) {
  if (!utils.canDeploy(network, 'Registry')) {
    return;
  }

  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);

  deployer.deploy(DLL)
    .then(() => deployer.deploy(AttributeStore))
    .then(() => deployer.link(DLL, Voting))
    .then(() => deployer.link(AttributeStore, Voting))
    .then(() => deployer.deploy(Voting, tokenContractAddress))
    .then(() => deployer.deploy(
      QuantstampParameterizer,
      tokenContractAddress,
      Voting.address,
      [
        params.minDeposit,
        params.pMinDeposit,
        params.applyStageLength,
        params.pApplyStageLength,
        params.commitStageLength,
        params.pCommitStageLength,
        params.revealStageLength,
        params.pRevealStageLength,
        params.dispensationPct,
        params.pDispensationPct,
        params.voteQuorum,
        params.pVoteQuorum,
        params.exitTimeDelay,
        params.exitPeriodLen
      ]))
    .then(() => deployer.deploy(
      Registry,
      tokenContractAddress,
      Voting.address,
      QuantstampParameterizer.address,
      tcrConfig.name
    ))
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'Registry',
      Registry.address
    ));
};
