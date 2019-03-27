pragma solidity 0.4.24;


interface IPolicy {
    function isViolated(address contractAddress) external view returns(bool);
}


interface Staking {
    function getPoolState(uint256) external view returns(uint256);
}


contract CandidateAndPolicyContract is IPolicy {
    uint256 public constant CANCELLED = 6;  // the pool state corresponding to "Cancelled"
    Staking quantstamp_staking;
    uint256 insuredPool = 0;

    constructor(address addr) public { 
        quantstamp_staking = Staking(addr);
    }

    function checkPolicyStatus(uint policyId) public view returns (uint256) {
        return quantstamp_staking.getPoolState(policyId);
    }

    function checkIfPoolCancelled(uint policyId) public view returns (bool) {
        uint256 poolState = checkPolicyStatus(policyId);
        return poolState == CANCELLED;
    }

    function isViolated(address contractAddress) public view returns (bool) {
        return checkIfPoolCancelled(insuredPool);
    }
}
