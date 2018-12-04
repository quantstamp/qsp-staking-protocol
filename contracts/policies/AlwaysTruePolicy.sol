pragma solidity 0.4.24;

import "../IPolicy.sol";

/// @title AlwaysTruePolicy - the policy is always violated.

contract AlwaysTruePolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
      return true;
    }
}
