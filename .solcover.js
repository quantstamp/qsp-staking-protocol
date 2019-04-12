module.exports = {
    port: 7545,
    testCommand: './solcover-eth-bridge.sh',
    copyPackages: ['openzeppelin-solidity'],
    skipFiles: ['test/Registry.sol', 'test/Parameterizer.sol', 'test/QuantstampToken.sol', 'test/CandidateToken.sol', 'test/CandidateAndPolicyContract.sol']
};
