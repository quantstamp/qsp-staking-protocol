pragma solidity 0.4.24;

import "../IPolicy.sol";


interface Staking {
    function getPoolState(uint256) external view returns(uint256);
}


contract CandidateAndPolicyContract is IPolicy {
    uint256 public constant CANCELLED = 6;  // the pool state corresponding to "Cancelled"
    Staking quantstampStaking;
    uint256 poolId;

    constructor(address addr, uint256 id) public { 
        quantstampStaking = Staking(addr);
        poolId = id;
    }

    function isViolated(address contractAddress) public view returns (bool) {
        uint256 poolState = quantstampStaking.getPoolState(poolId);
        return poolState == CANCELLED;
    }
}
