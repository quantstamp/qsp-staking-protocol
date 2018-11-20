pragma solidity 0.4.24;

import "../IPolicy.sol";
import "./CandidateToken.sol";


/// @title TotalSupplyNotExceededPolicy - the policy is violated if too many coins are minted
/// @author Jan Gorzny

contract TotalSupplyNotExceededPolicy is IPolicy {

    event Violated(bool value);

    uint256 public maximumSupply;

    constructor(
      uint256 max
    ) public {
      maximumSupply =  max * 10 ** uint256(18);
    }

    function isViolated(address contractAddress) external view returns(bool) {
      CandidateToken candidateToken = CandidateToken(contractAddress);
      if (candidateToken.totalSupply() > maximumSupply) {
          emit Violated(true);
          return true;
      } else {
          emit Violated(false);
          return false;
      }
    }
}
