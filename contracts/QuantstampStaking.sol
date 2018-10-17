pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author

import {Registry} from "./tcr/Registry.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract ContractPolicy {
    function isViolated(address protectedContract) public view returns (bool);
}

contract QuantstampStaking is Ownable {
    using SafeMath for uint256;

    struct Stake {
        address staker; // the address of the staker
        uint amountQspWei; // the amount staked by the staker
    }

    // state of the pool's lifecycle
    enum PoolState {
        None,
        Initialized, // insuffucient stakes
        NotViolatedUnderfunded, // sufficient stakes, insufficient deposit
        ViolatedUnderfunded, // sufficient stakes, insufficient deposit, violated
        NotViolatedFunded,  // sufficient stakes, sufficient deposit
        ViolatedFunded, // sufficient stakes, sufficient deposit, violated
        Cancelled
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
        PoolState state;
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

    // TCR used to list expert stakers.
    Registry public stakingRegistry;

    event ClaimWithdrawn(uint poolId, uint balanceQspWei);

    constructor(address tokenAddress, address tcrAddress) public {
        balanceQspWei = 0;
        currentPoolNumber = 0;
        require(tokenAddress != address(0));
        token = StandardToken(tokenAddress);
        require(tcrAddress != address(0));
        stakingRegistry = Registry(tcrAddress);
    }

    /**
    * Gives all the staked funds to the stakeholder provided that the policy was violated and the
    * state of the contract allows.
    */
    function withdrawClaim(uint poolIndex) public {
        address poolOwner = getPoolOwner(poolIndex);
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        PoolState currentState = getPoolState(poolIndex);
        require(poolOwner == msg.sender);
        require(ContractPolicy(poolPolicy).isViolated(candidateContract));
        
        /* The pool can be converted into Pool.ViolatedFunded funded state by calling
           function withdraw interest, therefore we need to allow this state as well */
        require(currentState == PoolState.NotViolatedFunded 
                || currentState == PoolState.ViolatedFunded);
        
        /* todo(mderka) Consider design the does not require iteration over stakes
           created SP-45 */ 
        // return all stakes
        bool result = false;
        uint total = 0;
        for (uint i = 0; i < stakes[poolIndex].length; i++) {
            Stake storage stake = stakes[poolIndex][i];
            result = token.transfer(poolOwner, stake.amountQspWei);
            require(result);
            /* todo(mderka) Is this attribute necessary? It can be read using 
               balanceOf in ERC20. Created SP-44. */
            balanceQspWei = balanceQspWei.sub(stake.amountQspWei);
            total = total.add(stake.amountQspWei);
            stake.amountQspWei = 0;
        }
        result = token.transfer(poolOwner, total);
        require(result);
        balanceQspWei = balanceQspWei.sub(total);
        uint deposit = getPoolDepositQspWei(poolIndex);
        result = token.transfer(poolOwner, deposit);
        require(result);
        pools[i].depositQspWei = 0;
        pools[i].state = PoolState.ViolatedFunded;

        emit ClaimWithdrawn(poolIndex, total);
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

    function getStakingRegistry() public view returns (address) {
        return address(stakingRegistry);
    }
    
    function getPoolState(uint index) public view returns(PoolState) {
       return pools[index].state;
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
        if (!token.transferFrom(msg.sender, address(this), depositQspWei)) {
            revert();
        }

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
            urlOfAuditReport,
            PoolState.Initialized);
        pools[currentPoolNumber] = p;
        currentPoolNumber = currentPoolNumber.add(1);
        balanceQspWei = balanceQspWei.add(depositQspWei);
    }

    function isExpert(address addr) public view returns(bool) {
        return stakingRegistry.isWhitelisted(bytes32(addr));
    }
}
