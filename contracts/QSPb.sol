pragma solidity 0.4.24;

/// @title QSPb - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract QSPb is Ownable {
    using SafeMath for uint256;

    struct Stake {
        address staker;
        uint amount;
    }

    struct Pool {
        address candidateContract;
        address contractPolicy;
        address owner;
        uint maxPayout;
        uint minStake;
        uint deposit;
        uint bonusExpert;
        uint bonusFirstExpert;
        uint payPeriod;
        uint minStakeTimeInBlocks; // the minimum number of blocks that funds need to be staked for 
        uint timeoutInBlocks; // the number of blocks after which a pool is canceled if there are not enough stakes
        uint timeOfInitInBlocks; // the block number when the pool was initialized
        string urlOfAuditReport;
    }

    // store sha3(Pool) as the key of the mapping
    mapping (bytes32 => Stake[]) public stakes; 
    uint public balance;  
    Pool[] internal pools;
  
    constructor() public {
        balance = 0;
    }

    function getPoolsLength() public view returns (uint) {
        return pools.length;
    }

    function getPoolCandidateContract(uint index) public view returns(address) {
        return pools[index].candidateContract;
    }

    function getPoolContractPolicy(uint index) public view returns(address) {
        return pools[index].contractPolicy;
    }

    function getPoolOwner(uint index) public view returns(address) {
        return pools[index].owner;
    }

    function getPoolMaxPayout(uint index) public view returns(uint) {
        return pools[index].maxPayout;
    }

    function getPoolMinStake(uint index) public view returns(uint) {
        return pools[index].minStake;
    }

    function getPoolDeposit(uint index) public view returns(uint) {
        return pools[index].deposit;
    }

    function getPoolBonusExpert(uint index) public view returns(uint) {
        return pools[index].bonusExpert;
    }

    function getPoolBonusFirstExpert(uint index) public view returns(uint) {
        return pools[index].bonusFirstExpert;
    }

    function getPoolPayPeriod(uint index) public view returns(uint) {
        return pools[index].payPeriod;
    }

    function getPoolMinStakeTime(uint index) public view returns(uint) {
        return pools[index].minStakeTimeInBlocks;
    }

    function getPoolTimeout(uint index) public view returns(uint) {
        return pools[index].timeoutInBlocks;
    }

    function getPoolTimeOfInit(uint index) public view returns(uint) {
        return pools[index].timeOfInitInBlocks;
    }

    function getPoolUrlOfAuditReport(uint index) public view returns(string) {
        return pools[index].urlOfAuditReport;
    }

    function createPool(
        address candidateContract, 
        address contractPolicy, 
        uint maxPayout, 
        uint minStake, 
        uint bonusExpert, 
        uint bonusFirstExpert, 
        uint payPeriod, 
        uint minStakeTime, 
        uint timeout,
        string urlOfAuditReport
    ) public payable {
        Pool memory p = Pool(
            candidateContract, 
            contractPolicy, 
            msg.sender, 
            maxPayout, 
            minStake, 
            msg.value, 
            bonusExpert, 
            bonusFirstExpert, 
            payPeriod, 
            minStakeTime, 
            timeout, 
            block.number, 
            urlOfAuditReport);
        pools.push(p);
    }
}
