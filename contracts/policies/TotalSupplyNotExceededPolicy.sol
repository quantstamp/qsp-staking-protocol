pragma solidity 0.4.24;

import "../IPolicy.sol";
import "../test/CandidateToken.sol";


/// @title TotalSupplyNotExceededPolicy - the policy is violated if too many coins are minted
/// @author Jan Gorzny

contract TotalSupplyNotExceededPolicy is IPolicy {

    uint256 public maximumSupply;

    constructor(
      uint256 max
    ) public {
      maximumSupply =  max;
    }

    function isViolated(address contractAddress) external view returns(bool) {
      CandidateToken candidateToken = CandidateToken(contractAddress);
      if (candidateToken.totalSupply() > maximumSupply) {
          return true;
      } else {
          return false;
      }
    }
}
