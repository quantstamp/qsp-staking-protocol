pragma solidity 0.4.24;

import "./IPolicy.sol";


interface Staking {
    function getPoolState(uint256) external view returns(uint256);
}


contract CandidateAndPolicyContract is IPolicy {
    uint256 public constant CANCELLED = 6;  // the pool state corresponding to "Cancelled"
    Staking private quantstampStaking;
    uint256 private poolId;

    constructor(address _addr, uint256 _poolId) public { 
        quantstampStaking = Staking(_addr);
        poolId = _poolId;
    }

    function isViolated(address contractAddress) public view returns (bool) {
        uint256 poolState = quantstampStaking.getPoolState(poolId);
        return poolState == CANCELLED;
    }
}
