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

    // Note: may require too much gas eventually
    function balanceCoversStakes() internal view returns(bool){
        uint currentPoolNumber = staking.getPoolsLength();
        uint totalStaked = 0;
        for (uint i=0; i < currentPoolNumber; i++) {
          if (staking.getPoolState(i) == QuantstampStaking.PoolState(4)) {
            totalStaked = totalStaked.add(staking.getPoolSizeQspWei(i));
          }
        }
        return staking.balanceQspWei() >= totalStaked;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == assuranceContractAddress);
        bool violated = !balanceCoversStakes();
        return violated;
    }

}
