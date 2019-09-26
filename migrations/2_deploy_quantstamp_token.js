/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

const QuantstampToken = artifacts.require('test/QuantstampToken');

module.exports = function(deployer, network, accounts) {

  if (network === "development") {
    let admin = accounts[1];
    deployer.deploy(QuantstampToken, admin);
  }
};
