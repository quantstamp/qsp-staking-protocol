/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";

/// @title TrivialBackdoorPolicy - the policy is violated if someone says it is.

contract TrivialBackdoorPolicy is IPolicy {

    // Whether or not the policy was violated
    bool public contractViolated;

    function updateStatus(bool status) public {
      contractViolated = status;
    }

    function isViolated(address contractAddress) external view returns(bool) {
      return contractViolated;
    }
}
