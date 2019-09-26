/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";

/// @title UpgradeablePolicy The policy calls a function on another contract.
///                          The initial contract it points to returns false;
///                          the initial policy is replaced with one that always
///                          returns true.

contract UpgradeablePolicy is IPolicy {

    // Never directly interact with the candidate contract,
    // but noted for staker's reference
    address public candidateContract;

    address public stakeholder;

    IPolicy public policyLogic;

    constructor (address contractAddress, address stakeholderAddress, address logicAddress) public {
        candidateContract = contractAddress;
        stakeholder = stakeholderAddress;
        policyLogic = IPolicy(logicAddress);
    }

    function changePolicyLogic (address newLogicAddress) public {
      require(msg.sender == stakeholder);
      policyLogic = IPolicy(newLogicAddress);
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == candidateContract);
        return policyLogic.isViolated(contractAddress);
    }

}
