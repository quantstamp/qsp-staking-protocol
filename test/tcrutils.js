/* eslint-env mocha */
/* global artifacts */

const abi = require('ethereumjs-abi');
const fs = require('fs');

const EthRPC = require('ethjs-rpc');
const HttpProvider = require('ethjs-provider-http');
const ethRPC = new EthRPC(new HttpProvider('http://localhost:7545'));

const config = JSON.parse(fs.readFileSync('./test/config.json'));
const paramConfig = config.paramDefaults;
const parameters = [
  paramConfig.minDeposit,
  paramConfig.pMinDeposit,
  paramConfig.applyStageLength,
  paramConfig.pApplyStageLength,
  paramConfig.commitStageLength,
  paramConfig.pCommitStageLength,
  paramConfig.revealStageLength,
  paramConfig.pRevealStageLength,
  paramConfig.dispensationPct,
  paramConfig.pDispensationPct,
  paramConfig.voteQuorum,
  paramConfig.pVoteQuorum,
  paramConfig.exitTimeDelay,
  paramConfig.exitPeriodLen,
];

const BN = require('bignumber.js');
const bigTen = number => new BN(number.toString(10), 10);
const minDep = bigTen(paramConfig.minDeposit);

const tcrutils = {

  minDep,       //The minimum deposit for a TCR application
  parameters,   //All parameters for the TCR

  //A function for providing a hash of a string for a TCR entry.
  getListingHash: domain => (
    `0x${abi.soliditySHA3(['string'], [domain]).toString('hex')}`
  ),

  /*
    domain    The listing hash
    deposit   The minimum deposit provided by the actor for an application
    actor     The address submitting the application
    registry  The TCR address
  */
  addToWhitelist: async (domain, deposit, actor, registry) => {
    // Have actor apply to put domain on the TCR
    await tcrutils.as(actor, registry.apply, domain, deposit, '');

    // Wait for the challenge period to expire, unchallenged.
    await tcrutils.increaseTime(paramConfig.applyStageLength + 1);

    // Inform the TCR that the challenge period is over, and update status of the
    // application as appropriate (whitelisted)
    await tcrutils.as(actor, registry.updateStatus, domain);
  },

  // Run the EVM for some time, to enable TCR challenge/voting periods to expire
  increaseTime: async seconds =>
    new Promise((resolve, reject) => ethRPC.sendAsync({
      method: 'evm_increaseTime',
      params: [seconds],
    }, (err) => {
      if (err) reject(err);
      resolve();
    }))
      .then(() => new Promise((resolve, reject) => ethRPC.sendAsync({
        method: 'evm_mine',
        params: [],
      }, (err) => {
        if (err) reject(err);
        resolve();
      }))),

  as: (actor, fn, ...args) => {
    function detectSendObject(potentialSendObj) {
      function hasOwnProperty(obj, prop) {
        const proto = obj.constructor.prototype;
        return (prop in obj) &&
          (!(prop in proto) || proto[prop] !== obj[prop]);
      }
      if (typeof potentialSendObj !== 'object') { return undefined; }
      if (
        hasOwnProperty(potentialSendObj, 'from') ||
        hasOwnProperty(potentialSendObj, 'to') ||
        hasOwnProperty(potentialSendObj, 'gas') ||
        hasOwnProperty(potentialSendObj, 'gasPrice') ||
        hasOwnProperty(potentialSendObj, 'value')
      ) {
        throw new Error('It is unsafe to use "as" with custom send objects');
      }
      return undefined;
    }
    detectSendObject(args[args.length - 1]);
    const sendObject = { from: actor };
    return fn(...args, sendObject);
  },

};

module.exports = tcrutils;
