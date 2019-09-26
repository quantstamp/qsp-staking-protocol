/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

const Util = require("./util.js");
const WhitelistExpertRegistry = artifacts.require('WhitelistExpertRegistry');

contract('WhitelistExpertRegistry', function(accounts) {

  const owner = accounts[0];
  const expert = accounts[1];
  const nonExpert = accounts[2];
  let whitelist;

  beforeEach(async function () {
    whitelist = await WhitelistExpertRegistry.new();
  });

  describe('WhitelistExpertRegistry', () => {
    it("nobody should be an expert at first", async function() {
      assert.isFalse(await whitelist.isExpert(nonExpert));
      assert.isFalse(await whitelist.isExpert(expert));
      assert.isFalse(await whitelist.isExpert(owner));
    });

    it("should fail when a non-owner tries to add an expert", async function() {
      await Util.assertTxFail(whitelist.addExpert(expert, {from: expert}));
    });
    
    it("should fail when a non-owner tries to remove an expert", async function() {
      await whitelist.addExpert(expert, {from: owner});
      await Util.assertTxFail(whitelist.removeExpert(expert, {from: expert}));
    });

    it("should succeed when an owner tries to add an expert", async function() {
      await whitelist.addExpert(expert, {from: owner});
      assert.isTrue(await whitelist.isExpert(expert));
      assert.isFalse(await whitelist.isExpert(nonExpert));
    });
    
    it("should succeed when an owner tries to remove an expert", async function() {
      await whitelist.addExpert(expert, {from: owner});
      assert.isTrue(await whitelist.isExpert(expert));
      assert.isFalse(await whitelist.isExpert(nonExpert));
      await whitelist.removeExpert(expert, {from: owner});
      assert.isFalse(await whitelist.isExpert(expert));
      assert.isFalse(await whitelist.isExpert(nonExpert));
    });
  });

});
