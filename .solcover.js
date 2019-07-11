module.exports = {
    port: 7545,
    testCommand: './solcover-eth-bridge.sh',
    copyPackages: ['openzeppelin-solidity'],
    skipFiles: [
      'registries/token-curated-registry/Registry.sol',
      'registries/token-curated-registry/Parameterizer.sol',
      'test/QuantstampToken.sol',
      'policies/CandidateToken.sol',
      'policies/CandidateAndPolicyContract.sol'
    ]
};
