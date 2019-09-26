/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

/// @title IRegistry - interface for TCRs and whitelists that the protocol uses to check experts
/// @author Quantstamp

interface IRegistry {
    function isExpert(address account) external view returns(bool);
}
