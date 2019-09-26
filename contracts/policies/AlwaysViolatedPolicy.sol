/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";

/// @title AlwaysViolatedPolicy - the policy is always violated.

contract AlwaysViolatedPolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
      return true;
    }
}
