pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author

import {Registry} from "./tcr/Registry.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./IPolicy.sol";

contract QuantstampStaking is Ownable {
    using SafeMath for uint256;

    struct Stake {
        address staker; // the address of the staker
        uint amountQspWei; // the amount staked by the staker
        uint blockNumber; // the Block number when this stake was made
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
        uint timeOfStateInBlocks; // the block number when the pool was set in its current state
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

    event DepositMade(
      uint poolIndex,
      address actor,
      uint amountQspWei
    );

    event DepositWithdrawn(
      uint poolIndex,
      address actor,
      uint amountQspWei
    );

    event ClaimWithdrawn(uint poolId, uint balanceQspWei);

    // Event signaling that staker has staked amountQspWei at poolIndex
    event StakePlaced(uint poolIndex, address staker, uint amountQspWei);

    // Event signaling that the state of the pool has changed
    event StateChanged(uint poolIndex, PoolState state);

    modifier whenViolated(uint poolIndex) {
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        require(IPolicy(poolPolicy).isViolated(candidateContract));
        _;
    }

    modifier whenNotViolated(uint poolIndex) {
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        require(!IPolicy(poolPolicy).isViolated(candidateContract));
        _;
    }

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
    function withdrawClaim(uint poolIndex) public whenViolated(poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        PoolState currentState = getPoolState(poolIndex);
        require(poolOwner == msg.sender);
        
        /* The pool can be converted into Pool.ViolatedFunded funded state by calling
           function withdraw interest, therefore we need to allow this state as well */
        require(currentState == PoolState.NotViolatedFunded 
                || currentState == PoolState.ViolatedFunded);
        
        /* todo(mderka) Consider design the does not require iteration over stakes
           created SP-45 */ 
        // return all stakes
        bool result = false;
        uint total = getPoolDepositQspWei(poolIndex);
        for (uint i = 0; i < stakes[poolIndex].length; i++) {
            Stake storage stake = stakes[poolIndex][i];
            /* todo(mderka) Is this attribute necessary? It can be read using 
               balanceOf in ERC20. Created SP-44. */
            balanceQspWei = balanceQspWei.sub(stake.amountQspWei);
            total = total.add(stake.amountQspWei);
            stake.amountQspWei = 0;
        }
        result = token.transfer(poolOwner, total);
        require(result);
        balanceQspWei = balanceQspWei.sub(total);
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

    function getPoolTimeOfStateInBlocks(uint index) public view returns(uint) {
        return pools[index].timeOfStateInBlocks;
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
        /* addr is of type Address which is 20 Bytes, but
           the TCR expects all entries to be of type Bytes32.
           addr is first cast to Uint256 so that it becomes 32 bytes long,
           addr is then shifted 12 bytes (96 bits) to the left so the 20
           important bytes are in the correct spot. */
        return stakingRegistry.isWhitelisted(bytes32(uint256(addr) << 96));
    }

    function setState(uint poolIndex, PoolState newState) internal {
        pools[poolIndex].state = newState; // set the state
        pools[poolIndex].timeOfStateInBlocks = block.number; // set the time when the state changed
        emit StateChanged(poolIndex, newState); // emit an event that the state has changed
    }

    function getTotalFundsStaked(uint poolIndex) internal returns(uint) {
        uint total = 0;
        for (uint i = 0; i < stakes[poolIndex].length; i++) {
            Stake stake = stakes[poolIndex][i];
            total = total.add(stake.amountQspWei);
        }
        return total;
    }

    /**
    * Transfers an amount of QSP from the staker to the pool
    * @param poolIndex - the index of the pool where the funds are transferred to
    * @param amountQspWei - the amount of QSP Wei that is transferred
    */
    function stakeFunds(uint poolIndex, uint amountQspWei) public whenNotViolated(poolIndex) {
        PoolState state = getPoolState(poolIndex);
        require((state == PoolState.Initialized) || 
            (state == PoolState.NotViolatedUnderfunded) || 
            (state == PoolState.NotViolatedFunded));

        // Check if pool can be switched from the initialized state to another state
        if ((state == PoolState.Initialized) &&
            (getPoolTimeoutInBlocks(poolIndex) <= block.number.sub(getPoolTimeOfStateInBlocks(poolIndex)))) {
                // then timeout has occured and stakes are not allowed
                setState(poolIndex, PoolState.Cancelled);
                return;
        }
            
        // If policy is not violated then transfer the stake
        require(token.transferFrom(msg.sender, address(this),  amountQspWei));

        // Create new Stake struct
        Stake memory stake = Stake(msg.sender, amountQspWei, block.number);
        stakes[poolIndex].push(stake);
        balanceQspWei.add(amountQspWei);
        
        // Check if there are enough stakes in the pool
        uint total = getTotalFundsStaked(poolIndex);
        if (total >= getPoolMinStakeQspWei(poolIndex)) { // Minimum staking value was reached
            if (getPoolDepositQspWei(poolIndex) >= getPoolMaxPayoutQspWei(poolIndex)) {
                // The pool is funded by enough to pay stakers
                setState(poolIndex, PoolState.NotViolatedFunded);
            } else {
                // The pool is does not have enough funds to pay stakers
                setState(poolIndex, PoolState.NotViolatedUnderfunded);
            }
        }
        emit StakePlaced(poolIndex, msg.sender, amountQspWei);    
    }

    function setState(uint poolIndex, PoolState newState) internal {
        pools[poolIndex].state = newState; // set the state
        pools[poolIndex].timeOfStateInBlocks = block.number; // set the time when the state changed
        emit StateChanged(poolIndex, newState); // emit an event that the state has changed
    }

    function stakeFunds(uint poolIndex, uint amountQspWei) public {
        PoolState state = getPoolState(poolIndex);
        require((state == PoolState.Initialized) || 
            (state == PoolState.NotViolatedUnderfunded) || 
            (state == PoolState.NotViolatedFunded));

        // Check if the policy is violated. Staking is not allowed if this is the case.
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        require(!IPolicy(poolPolicy).isViolated(candidateContract));

        // Check if pool can be switched from the initialized state to another state
        if ((state == PoolState.Initialized) &&
            (getPoolTimeoutInBlocks(poolIndex) <= block.number.sub(getPoolTimeOfStateInBlocks(poolIndex)))) {
                // then timeout has occured and stakes are not allowed
                setState(poolIndex, PoolState.Cancelled);
        } else { // Timeout has not occured
            // If policy is not violated then transfer the stake
            bool result = token.transferFrom(msg.sender, address(this),  amountQspWei);
            require(result);

            // Create new Stake struct
            Stake memory stake = Stake(msg.sender, amountQspWei, block.number);
            stakes[poolIndex].push(stake);
            balanceQspWei.add(amountQspWei);
            
            // Check if there are enough stakes in the pool
            uint total = 0;
            for (uint i = 0; i < stakes[poolIndex].length; i++) {
                stake = stakes[poolIndex][i];
                total = total.add(stake.amountQspWei);
            }

            if (total >= getPoolMinStakeQspWei(poolIndex)) { // Minimum staking value was reached
                if (getPoolDepositQspWei(poolIndex) >= getPoolMaxPayoutQspWei(poolIndex)) {
                    // The pool is funded by enough to pay stakers
                    setState(poolIndex, PoolState.NotViolatedFunded);
                } else {
                    // The pool is does not have enough funds to pay stakers
                    setState(poolIndex, PoolState.NotViolatedUnderfunded);
                }
            }
            emit StakePlaced(poolIndex, msg.sender, amountQspWei);
        }    
    }

    /*
    * Allows the stakeholder to make an additional deposit to the contract
    */
    function depositFunds(uint poolIndex, uint depositQspWei) public {
      address poolOwner = getPoolOwner(poolIndex);
      require(poolOwner == msg.sender);
      PoolState currentState = getPoolState(poolIndex);

      require(currentState == PoolState.NotViolatedFunded
                || currentState == PoolState.Initialized
                || currentState == PoolState.NotViolatedUnderfunded
             );

      require(token.transferFrom(poolOwner, this, depositQspWei));
      pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.add(depositQspWei);
      balanceQspWei = balanceQspWei.add(withdrawalAmountQspWei);

      if (currentState == NotViolatedUnderfunded
        && depositQspWei >= maxPayoutQspWei) {
          setState(poolIndex, PoolState.NotViolatedFunded);
      }

      emit DepositMade(poolIndex, poolOwner, depositQspWei);
    }

    /*
    * Allows the stakeholder to withdraw their deposits from the contract
    * if the policy is not violated
    */
    function withdrawDeposit(uint poolIndex) public {
      address poolOwner = getPoolOwner(poolIndex);
      require(poolOwner == msg.sender);
      PoolState currentState = getPoolState(poolIndex);
      require(currentState == PoolState.NotViolatedFunded
                || currentState == PoolState.Initialized
                || currentState == PoolState.NotViolatedUnderfunded
                || currentState == PoolState.Cancelled
             );

      uint withdrawalAmountQspWei = pools[poolIndex].depositQspWei;
      require(withdrawalAmountQspWei > 0);
      pools[poolIndex].depositQspWei = 0;
      balanceQspWei = balanceQspWei.sub(withdrawalAmountQspWei);
      require(token.transfer(poolOwner, withdrawalAmountQspWei));
      emit DepositWithdrawn(poolIndex, poolOwner, withdrawalAmountQspWei);
    }
}
