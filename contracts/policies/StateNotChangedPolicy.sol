pragma solidity 0.4.24;

import "./IPolicy.sol";
import "./CandidateContract.sol";

/// @title StateNotChangedPolicy - the policy is violated if the state, as
///                                indicated by an `enum`, has changed

contract StateNotChangedPolicy is IPolicy {

    CandidateContract.ContractState public originalState;

    constructor(
        CandidateContract.ContractState _originalState
    ) public {
        originalState =  _originalState;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        CandidateContract candidateContract = CandidateContract(contractAddress);
        return (candidateContract.state() != originalState);
    }
}
