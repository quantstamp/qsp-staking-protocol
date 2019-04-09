const HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  deploy: {
    Registry: false,
    WhitelistExpertRegistry: false,
    QuantstampStakingData: false,
    QuantstampStaking: false
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 6712388,
      gasPrice: 1
    },
    dev: { // deploys to Ropsten (Dev stage)
      provider: function() {
        const credentials = require("./credentials.js");
        return new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/v3/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 6712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
  }
};
