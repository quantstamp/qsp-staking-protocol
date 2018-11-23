const truffle = require('../truffle.js');
const AWS = require('aws-sdk');
const web3 = require('web3');
const s3 = new AWS.S3({
  region: 'us-east-1'
});

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
  return getVersion().match(/^[^.]*/g);
}

function getBucketName() {
  return `qsp-protocol-contract`;
}

function getFileName(network, contractName, version, type) {
  return `${network}/${contractName}-v-${version}-${type}.json`;
}

function getMetaFileName(network, contractName, version) {
  return getFileName(network, contractName, version, 'meta');
}

function getAbiFileName(network, contractName, version) {
  return getFileName(network, contractName, version, 'abi');
}

async function readAddressFromMetadata(network, contractName) {
  const response = await s3.getObject({
    Bucket: getBucketName(),
    Key: getMetaFileName(network, contractName, getMajorVersion())
  }).promise();
  
  const responseJson = JSON.parse(response.Body.toString());
  console.log(`readAddressFromMetadata(...): ${contractName}:${network}: response JSON`,
    JSON.stringify(responseJson, null, 2));

  return responseJson.contractAddress;
}

async function contractAddress(network, contractName, defaultArtifact) {
  // defaultArtifact: the smart contract artifact
  // (output of artifacts.require('<contract-name'))
  // whose address will be used when deploying to other networks (e.g., Ganache)
  return network === 'development' ? defaultArtifact.address : await readAddressFromMetadata(network, contractName);
}

async function writeOnS3(bucketName, key, content) {
  return await s3.putObject({
    Bucket: bucketName,
    Key: key,
    ContentType: "application/json",
    Body: content
  }).promise();
}

async function updateAbiAndMetadata(network, contractName, contractAddress) {
  if (network === 'development'){
    console.log(`${contractName}: Skipping metadata and ABI update: network "${network}" is not eligible`);
    return;
  }

  const commitHash = require('child_process')
    .execSync('git rev-parse HEAD')
    .toString().trim();

  const networkConfig = truffle.networks[network];
  const metaContent = new Buffer(JSON.stringify({
    "contractAddress": web3.utils.toChecksumAddress(contractAddress),
    "creatorAddress": networkConfig.account,
    "commitHash": commitHash,
    "version": getVersion()
  }, null, 2));

  const abiContent = new Buffer(JSON.stringify(require(`../build/contracts/${contractName}.json`).abi, null, 2));

  const latestMetaFileName =  getMetaFileName(network, contractName, getMajorVersion());
  const versionedMetaFileName =  getMetaFileName(network, contractName, getVersion());

  const latestAbiFileName = getAbiFileName(network, contractName, getMajorVersion());
  const versionedAbiFileName = getAbiFileName(network, contractName, getVersion());

  const metaUpdateResponse = await writeOnS3(getBucketName(), latestMetaFileName, metaContent);
  console.log(`${contractName}: metadata update response:`, JSON.stringify(metaUpdateResponse, null, 2));

  const versionedMetaUpdateResponse = await writeOnS3(getBucketName(), versionedMetaFileName, metaContent);
  console.log(`${contractName}: versioned metadata update response:`, JSON.stringify(versionedMetaUpdateResponse, null, 2));

  const abiUpdateResponse = await writeOnS3(getBucketName(), latestAbiFileName, abiContent);
  console.log(`${contractName}: ABI update response:`, JSON.stringify(abiUpdateResponse, null, 2));

  const versionedAbiUpdateResponse = await writeOnS3(getBucketName(), versionedAbiFileName, abiContent);
  console.log(`${contractName}: versioned ABI update response:`, JSON.stringify(versionedAbiUpdateResponse, null, 2));
}

function canDeploy(network, contractName) {
  if (network === 'development') {
    return true;
  }

  if (truffle.deploy[contractName] !== true) {
    console.log(`${contractName}: Skipping deployment: deploy.${contractName} is not set to the boolean true`);
    return false;
  }

  return true;
}

module.exports = {
  tokenAddress,
  contractAddress,
  updateAbiAndMetadata,
  canDeploy
};
