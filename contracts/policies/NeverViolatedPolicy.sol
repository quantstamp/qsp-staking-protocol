pragma solidity 0.4.24;

import "../IPolicy.sol";

/// @title NeverViolatedPolicy - the policy is never violated.

contract NeverViolatedPolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
      return false;
    }
}
