/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

/// @title IPolicy - is the interface that all policies must implement in the Staking Protocol

interface IPolicy {
    function isViolated(address contractAddress) external view returns(bool);
}
