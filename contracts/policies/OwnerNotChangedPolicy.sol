pragma solidity 0.4.24;

import "../IPolicy.sol";
import "../test/CandidateToken.sol";


/// @title OwnerNotChangedPolicy - the policy is violated if the owner has changed
/// @author Alex Murashkin

contract OwnerNotChangedPolicy is IPolicy {

    address public originalOwner;

    constructor(
        address _originalOwner
    ) public {
        originalOwner =  _originalOwner;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        CandidateToken candidateToken = CandidateToken(contractAddress);
        return (candidateToken.owner() != originalOwner);
    }
}
