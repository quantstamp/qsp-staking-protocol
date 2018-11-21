pragma solidity 0.4.24;

import "./CandidateContract.sol";
import "../IPolicy.sol";

/// @title ZeroBalancePolicy - is an example policy that is violated when the balance reaches zero
/// @author Sebastian Banescu

contract ZeroBalancePolicy is IPolicy {

    function isViolated(address contractAddress) external view returns(bool) {
        CandidateContract candidateContract = CandidateContract(contractAddress);
        if (candidateContract.balance() == 0) {
            return true;
        } else {
            return false;
        }
    }
}
