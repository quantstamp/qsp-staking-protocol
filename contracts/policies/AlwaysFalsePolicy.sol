pragma solidity 0.4.24;

import "../IPolicy.sol";

/// @title AlwaysFalsePolicy - the policy is never violated.

contract AlwaysFalsePolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
      return false;
    }
}
