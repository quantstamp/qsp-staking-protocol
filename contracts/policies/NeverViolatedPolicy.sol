/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";

/// @title NeverViolatedPolicy - the policy is never violated.

contract NeverViolatedPolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
      return false;
    }
}
