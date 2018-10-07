pragma solidity 0.4.24;

/// @title QSPb - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "./LinkedListLib.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract QSPb is Ownable {
    using LinkedListLib for LinkedListLib.LinkedList;
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
        uint minStakeTime;
        uint timeout;
        uint timeOfInit;
        string urlOfAuditReport;
    }

    // store sha3(Pool) as the key of the mapping
    mapping (bytes32 => Stake[]) public stakes; 

    // constants used by LinkedListLib
    uint256 constant internal NULL = 0;
    uint256 constant internal HEAD = 0;
    bool constant internal PREV = false;
    bool constant internal NEXT = true;

    uint public balance;  
    Pool[] internal pools;
  
    constructor() public {
        balance = 0;
    }

    function getPoolsLength() public view returns (uint) {
        return pools.length;
    }

    function getPoolCandidateContract(uint index) public constant returns(address) {
        return pools[index].candidateContract;
    }

    function getPoolContractPolicy(uint index) public constant returns(address) {
        return pools[index].contractPolicy;
    }

    function getPoolOwner(uint index) public constant returns(address) {
        return pools[index].owner;
    }

    function getPoolMaxPayout(uint index) public constant returns(uint) {
        return pools[index].maxPayout;
    }

    function getPoolMinStake(uint index) public constant returns(uint) {
        return pools[index].minStake;
    }

    function getPoolDeposit(uint index) public constant returns(uint) {
        return pools[index].deposit;
    }

    function getPoolBonusExpert(uint index) public constant returns(uint) {
        return pools[index].bonusExpert;
    }

    function getPoolBonusFirstExpert(uint index) public constant returns(uint) {
        return pools[index].bonusFirstExpert;
    }

    function getPoolPayPeriod(uint index) public constant returns(uint) {
        return pools[index].payPeriod;
    }

    function getPoolMinStakeTime(uint index) public constant returns(uint) {
        return pools[index].minStakeTime;
    }

    function getPoolTimeout(uint index) public constant returns(uint) {
        return pools[index].timeout;
    }

    function getPoolTimeOfInit(uint index) public constant returns(uint) {
        return pools[index].timeOfInit;
    }

    function getPoolUrlOfAuditReport(uint index) public constant returns(string) {
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
        bool audit
    ) public payable {
        string memory urlOfAuditReport = "";
        if (audit) { 
            //TODO: QSP.requestAudit(candidateContract); 
            urlOfAuditReport = "";
        }
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
            now, 
            urlOfAuditReport);
        pools.push(p);
    }
}
