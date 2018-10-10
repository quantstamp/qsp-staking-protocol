pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author 

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract QuantstampStaking is Ownable {
    using SafeMath for uint256;

    struct Stake {
        address staker; // the address of the staker
        uint amountQspWei; // the amount staked by the staker
    }

    struct Pool {
        address candidateContract; // the contract that must be protected
        address contractPolicy; // the policy that must be respected by the candidate contract
        address owner; // the owner of the pool (the stakeholder), not the owner of the contract
        uint maxPayoutQspWei; // the maximum payout that will be awarded to all stakers per payout period
        uint minStakeQspWei; // the minimum value that needs to be raised from all stakers together
        uint depositQspWei; // the current value deposited by the owner/stakeholder
        uint bonusExpertFactor; // the factor by which the payout of an expert is multiplied
        uint bonusFirstExpertFactor; // the factor by which the payout of the first expert is multiplied
        uint payPeriodInBlocks; // the number of blocks after which stakers are payed incentives, in case of no breach 
        uint minStakeTimeInBlocks; // the minimum number of blocks that funds need to be staked for 
        uint timeoutInBlocks; // the number of blocks after which a pool is canceled if there are not enough stakes
        uint timeOfInitInBlocks; // the block number when the pool was initialized
        string urlOfAuditReport; // a URL to some audit report (could also be a white-glove audit)
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

    function getPoolMaxPayoutQspWei(uint index) public view returns(uint) {
        return pools[index].maxPayoutQspWei;
    }

    function getPoolMinStakeQspWei(uint index) public view returns(uint) {
        return pools[index].minStakeQspWei;
    }

    function getPoolDepositQspWei(uint index) public view returns(uint) {
        return pools[index].depositQspWei;
    }

    function getPoolBonusExpertFactor(uint index) public view returns(uint) {
        return pools[index].bonusExpertFactor;
    }

    function getPoolBonusFirstExpertFactor(uint index) public view returns(uint) {
        return pools[index].bonusFirstExpertFactor;
    }

    function getPoolPayPeriodInBlocks(uint index) public view returns(uint) {
        return pools[index].payPeriodInBlocks;
    }

    function getPoolMinStakeTimeInBlocks(uint index) public view returns(uint) {
        return pools[index].minStakeTimeInBlocks;
    }

    function getPoolTimeoutInBlocks(uint index) public view returns(uint) {
        return pools[index].timeoutInBlocks;
    }

    function getPoolTimeOfInitInBlocks(uint index) public view returns(uint) {
        return pools[index].timeOfInitInBlocks;
    }

    function getPoolUrlOfAuditReport(uint index) public view returns(string) {
        return pools[index].urlOfAuditReport;
    }

    function createPool(
        address candidateContract, 
        address contractPolicy, 
        uint maxPayoutQspWei, 
        uint minStakeQspWei, 
        uint bonusExpertFactor, 
        uint bonusFirstExpertFactor, 
        uint payPeriodInBlocks, 
        uint minStakeTimeInBlocks, 
        uint timeoutInBlocks,
        string urlOfAuditReport
    ) public payable {
        Pool memory p = Pool(
            candidateContract, 
            contractPolicy, 
            msg.sender, 
            maxPayoutQspWei, 
            minStakeQspWei, 
            msg.value, 
            bonusExpertFactor, 
            bonusFirstExpertFactor, 
            payPeriodInBlocks, 
            minStakeTimeInBlocks, 
            timeoutInBlocks, 
            block.number, 
            urlOfAuditReport);
        pools.push(p);
    }
}
