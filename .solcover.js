module.exports = {
    port: 7545,
    testCommand: 'cp ./truffle-coverage.js ./truffle.js && (truffle test &) && (ethereum-bridge -H localhost:7545 -a 1 &)',
    copyPackages: ['openzeppelin-solidity'],
    skipFiles: ['test/Registry.sol', 'test/Parameterizer.sol', 'test/QuantstampToken.sol', 'test/CandidateToken.sol', 'test/CandidateAndPolicyContract.sol']
};
