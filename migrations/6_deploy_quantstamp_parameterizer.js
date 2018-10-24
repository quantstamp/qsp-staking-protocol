const QuantstampParameterizer = artifacts.require('test/Parameterizer');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(QuantstampParameterizer);
  }
};
