pragma solidity 0.4.24;

import "../IPolicy.sol";
import "../QuantstampStaking.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title QuantstampAssurancePolicy  The contract is violated if the Quantstamp Assurance
///                                   contract misbehaves.

contract QuantstampAssurancePolicy is IPolicy {
    using SafeMath for uint256;
    using Math for uint256;

    // The instance of Quantstamp Assurance
    QuantstampStaking staking;
    uint assurancePoolId;

    constructor (address contractAddress) public {
        staking = QuantstampStaking(contractAddress);
        assurancePoolId = 0;
    }

    // Note: only checks NotViolatedFunded pools
    // Note: may require too much gas eventually
    function balanceCoversStakesAndDeposits() internal view returns(bool){
        uint currentPoolNumber = staking.getPoolsLength();
        uint totalDeposited = 0;
        uint totalStaked = 0;
        for (uint i=0; i < currentPoolNumber; i++) {
          if (staking.getPoolState(i) == QuantstampStaking.PoolState(4)) {
            totalStaked = totalStaked.add(staking.getPoolSizeQspWei(i));
            totalDeposited = totalDeposited.add(staking.getPoolDepositQspWei(i));
          }
          // Note: we do this here to avoid iterating over the pools twice
          if (staking.getPoolCandidateContract(i) == address(staking) &&
              staking.getPoolContractPolicy(i) == address(this)) {
            assurancePoolId = i;
          }
        }
        return staking.balanceQspWei() >= totalStaked.add(totalDeposited);
    }

    function assuranceIsNeverViolated() internal view returns(bool){
      // Better not be ViolatedUnderfunded (3) or ViolatedFunded (5)
      return staking.getPoolState(assurancePoolId) != QuantstampStaking.PoolState(3) &&
        staking.getPoolState(assurancePoolId) != QuantstampStaking.PoolState(5);
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == address(staking));
        return !(balanceCoversStakesAndDeposits() && assuranceIsNeverViolated());
    }

}
