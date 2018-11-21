pragma solidity 0.4.24;

import "../IPolicy.sol";
import "./Registry.sol";


/// @title TCRContainsEntryPolicy - the policy is violated if some entry is not on a TCR
/// @author Jan Gorzny

contract TCRContainsEntryPolicy is IPolicy {

    bytes32 public interestingEntry;

    constructor (bytes32 newEntry) public {
      interestingEntry = newEntry;
    }

    function isViolated(address contractAddress) external view returns(bool) {
      Registry candidateContract = Registry(contractAddress);
      if (candidateContract.isWhitelisted(interestingEntry)) {
          return true;
      } else {
          return false;
      }
    }
}
