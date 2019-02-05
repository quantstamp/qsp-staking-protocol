pragma solidity 0.4.24;

import "../IPolicy.sol";
import "../QuantstampStaking.sol";
import "../QuantstampStakingData.sol";
import "../test/QuantstampToken.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title QuantstampAssurancePolicy  The contract is violated if the Quantstamp Assurance
///                                   contract misbehaves.

contract QuantstampAssurancePolicy is IPolicy {
    using SafeMath for uint256;
    using Math for uint256;

    // The instance of Quantstamp Assurance
    QuantstampStaking staking;
    QuantstampToken token;
    uint assurancePoolId;
    bool idSet;
    uint constant ViolatedUnderfunded = 3;
    uint constant ViolatedFunded = 5;

    constructor (address contractAddress, address qspTokenAddress) public {
        staking = QuantstampStaking(contractAddress);
        require(qspTokenAddress == address(staking.token()));
        token = QuantstampToken(qspTokenAddress);
        assurancePoolId = 0;
        idSet = false;
    }

    // Ensures that the balance of the contract contains at least as much
    // as the staked values so far, as well as all current stakeholder deposits
    function balanceCoversStakesAndDeposits() internal view returns(bool){
        return staking.getBalanceQspWei() >= token.balanceOf(address(staking));
    }

    function assuranceIsNeverViolated() internal view returns(bool){
      // Better not be ViolatedUnderfunded (3) or ViolatedFunded (5)
      return staking.getPoolState(assurancePoolId) != QuantstampStakingData.PoolState.ViolatedUnderfunded &&
        staking.getPoolState(assurancePoolId) != QuantstampStakingData.PoolState.ViolatedFunded;
    }

    function setAssurancePoolId(uint256 newId) external {
      require(staking.getPoolContractPolicy(newId) == address(this));
      require(staking.getPoolCandidateContract(newId) == address(staking));
      assurancePoolId = newId;
      idSet = true;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == address(staking));
        return !(idSet && balanceCoversStakesAndDeposits()
          && assuranceIsNeverViolated());
    }

}
