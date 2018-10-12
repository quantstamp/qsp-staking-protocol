pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author 

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
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

    // Stores the hash of the pool  as the key of the mapping and a list of stakes as the value.
    mapping (uint => Stake[]) public stakes; 

    // The total balance of the contract including all stakes and deposits
    uint public balanceQspWei;  

    // All pools including active and canceled pools
    mapping (uint => Pool) internal pools;
    
    // Current number of pools
    uint internal currentPoolNumber;

    // Token used to make deposits and stakes. This contract assumes that the owner of the contract 
    // trusts token's code and that transfer function (e.g. transferFrom, transfer) work correctly.
    StandardToken public token; 
  
    constructor(address tokenAddress) public {
        balanceQspWei = 0;
        currentPoolNumber = 0;
        require(tokenAddress != address(0));
        token = StandardToken(tokenAddress);
    }

    function getToken() public view returns (address) {
        return address(token);
    }

    function getPoolsLength() public view returns (uint) {
        return currentPoolNumber;
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
        uint depositQspWei,	
        uint bonusExpertFactor, 
        uint bonusFirstExpertFactor, 
        uint payPeriodInBlocks, 
        uint minStakeTimeInBlocks, 
        uint timeoutInBlocks,
        string urlOfAuditReport
    ) public {
        require(depositQspWei > 0);
        // transfer tokens to this contract
        if (!token.transferFrom(msg.sender, address(this), depositQspWei)) { revert(); }	
        Pool memory p = Pool(
            candidateContract, 
            contractPolicy, 
            msg.sender, 
            maxPayoutQspWei, 
            minStakeQspWei, 
            depositQspWei, 
            bonusExpertFactor, 
            bonusFirstExpertFactor, 
            payPeriodInBlocks, 
            minStakeTimeInBlocks, 
            timeoutInBlocks, 
            block.number, 
            urlOfAuditReport);
        pools[currentPoolNumber] = p;
        currentPoolNumber = currentPoolNumber.add(1);
        balanceQspWei = balanceQspWei.add(depositQspWei);
    }
}