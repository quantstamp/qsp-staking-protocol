const truffle = require('../truffle.js');
const web3 = require('web3');

const QSP_TOKEN_ADDRESS_MAINNET = "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d";
const QSP_TOKEN_ADDRESS_ROPSTEN = "0xc1220b0bA0760817A9E8166C114D3eb2741F5949";

function tokenAddress(network, defaultArtifact) {
  // defaultArtifact: the smart contract artifact
  // (output of artifacts.require('<contract-name'))
  // whose address will be used when deploying to other networks (e.g., Ganache)
  switch(network) {
    case 'dev':
    case 'ropsten':
      // 'ropsten' is useful for deploying to the Ropsten network separately,
      // without affecting Dev or Prod
      return QSP_TOKEN_ADDRESS_ROPSTEN;
    case 'prod':
      return QSP_TOKEN_ADDRESS_MAINNET;
    case 'development':
      return defaultArtifact.address;
    default:
      return QSP_TOKEN_ADDRESS_ROPSTEN;
  }
}

function getVersion() {
  return require('../package.json').version;
}

function getMajorVersion() {
  return getVersion().match(/^[^\.]*/g);
}

module.exports = {
  tokenAddress,
};
