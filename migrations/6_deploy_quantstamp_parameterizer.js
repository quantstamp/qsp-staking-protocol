const QuantstampParameterizer = artifacts.require('Parameterizer');

module.exports = function(deployer, network) {

  if (network === "development") {
    deployer.deploy(QuantstampParameterizer);
  }
};
