pragma solidity 0.4.24;

import "../IPolicy.sol";
import "../test/CandidateContract.sol";


<<<<<<< HEAD
/// @title StateNotChangedPolicy - the policy is violated if the state has changed
=======
/// @title StateNotChangedPolicy - the policy is violated if the state, as
///                                indicated by an `enum`, has changed
>>>>>>> 55c974a56da9b8635e3e1dc38bc3ca1248459cad

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
