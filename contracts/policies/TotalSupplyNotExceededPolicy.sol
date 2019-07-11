pragma solidity 0.4.24;

import "./IPolicy.sol";
import "./CandidateToken.sol";


/// @title TotalSupplyNotExceededPolicy - the policy is violated if too many coins are minted
contract TotalSupplyNotExceededPolicy is IPolicy {
    uint256 public maximumSupply;

    constructor(
        uint256 max
    ) public {
        maximumSupply = max;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        CandidateToken candidateToken = CandidateToken(contractAddress);
        return candidateToken.totalSupply() > maximumSupply;
    }
}
