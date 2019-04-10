module.exports = {
    port: 7545,
    testCommand: 'ethereum-bridge -H localhost:7545 -a 1 && mocha --timeout 5000',
    copyPackages: ['openzeppelin-solidity'],
    skipFiles: ['test/Registry.sol', 'test/Parameterizer.sol', 'test/QuantstampToken.sol', 'test/CandidateToken.sol', 'test/CandidateAndPolicyContract.sol']
};
