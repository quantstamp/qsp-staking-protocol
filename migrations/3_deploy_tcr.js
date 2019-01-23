const utils = require('./utils.js');
const Registry = artifacts.require('test/Registry');
const TokenCuratedRegistry = artifacts.require('TokenCuratedRegistry');
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampParameterizer = artifacts.require('test/Parameterizer');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const Voting = artifacts.require('plcr-revival/contracts/PLCRVoting.sol');
const tcrConfig = require('./tcr-config.js');
const params = tcrConfig.paramDefaults;
const truffle = require('../truffle.js');

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
      Registry
    ))
    .then(async() => await utils.updateAbiAndMetadata(
      network,
      'Registry',
      Registry.address
    ))
    .then(async() => await utils.callMethod({
      network,
      contractName: 'Registry',
      methodName: 'init',
      methodArgsFn: () => ([
        tokenContractAddress,
        Voting.address,
        QuantstampParameterizer.address,
        tcrConfig.name
      ]),
      sendArgs: {
        from: truffle.networks[network].account,
        gasPrice: truffle.networks[network].gasPrice,
        gas: truffle.networks[network].gas
      }
    })).then(() => {
      console.log('IMPORTANT: FOR PRODUCTION, MANUALLY CHECK THAT THE TCR WAS INITIALIZED. FAILURE TO DO SO MAY RESULT IN SOMEBODY ELSE INITIALIZING IT');
    })
    .then(() => deployer.deploy(TokenCuratedRegistry, Registry.address));
};
