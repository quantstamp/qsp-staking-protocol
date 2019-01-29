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
    address assuranceContractAddress;
    QuantstampStaking staking;

    constructor (address contractAddress) public {
        assuranceContractAddress = contractAddress;
        staking = QuantstampStaking(contractAddress);
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
        }
        return staking.balanceQspWei() >= totalStaked.add(totalDeposited);
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == assuranceContractAddress);
        return !(balanceCoversStakesAndDeposits());
    }

}
