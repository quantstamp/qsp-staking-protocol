pragma solidity 0.4.24;

import "../IPolicy.sol";

/// @title AlwaysViolatedPolicy - the policy is always violated.

contract AlwaysViolatedPolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
      return true;
    }
}
