pragma solidity 0.4.24;

import "../IPolicy.sol";

/// @title TrivialBackdoorPolicy - the policy is violated if someone says it is.
/// @author Jan Gorzny

contract TrivialBackdoorPolicy is IPolicy {

    event Violated(bool value);

    // Whether or not the policy was violated
    bool public contractViolated;

    function updateStatus(bool status) public {
      contractViolated = status;
    }

    function isViolated(address contractAddress) external view returns(bool) {
      emit Violated(contractViolated);
      return contractViolated;
    }
}
