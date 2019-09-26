/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";
import "../registries/token-curated-registry/Registry.sol";


/// @title TCRContainsEntryPolicy - the policy is violated if some entry is not on a TCR

contract TCRContainsEntryPolicy is IPolicy {

    bytes32 public interestingEntry;

    constructor (bytes32 newEntry) public {
      interestingEntry = newEntry;
    }

    function isViolated(address contractAddress) external view returns(bool) {
      Registry candidateContract = Registry(contractAddress);
      if (candidateContract.isWhitelisted(interestingEntry)) {
          return false;
      } else {
          return true;
      }
    }
}
