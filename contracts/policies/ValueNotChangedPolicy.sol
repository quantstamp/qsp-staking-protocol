/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";
import "./CandidateContract.sol";

/// @title ValeStateNotChangedPolicy - the policy is violated if the state
///                                       indicated by a int, has changed

contract ValueNotChangedPolicy is IPolicy {

    uint public originalValue;
    CandidateContract candidateContract;

    constructor(
        address candidateContractAddress
    ) public {
        candidateContract = CandidateContract(candidateContractAddress);

        // The name of the variable, along with its return type, needs to be
        // known during the time this contract is written.
        originalValue = candidateContract.balance();
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == address(candidateContract));
        return (candidateContract.balance() != originalValue);
    }
}
