pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author

import {Registry} from "./test/Registry.sol";
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
        PoolState state; // the current state of the pool
    }

    // Stores the hash of the pool  as the key of the mapping and a list of stakes as the value.
    mapping (uint => Stake[]) public stakes;
    
    // Total stakes contributed by each staker address into the pool defined by a pool hash (the mapping's key)
    mapping (uint => mapping(address => uint)) public totalStakes;

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

    // Signals that a stakeholder has made a deposit
    event DepositMade(
        uint poolIndex,
        address actor,
        uint amountQspWei
    );

    // Signals that a stakeholder has withdrawn the deposit
    event DepositWithdrawn(
        uint poolIndex,
        address actor,
        uint amountQspWei
    );
    
    // Signals that a staker has claimed a refund
    event StakerRefundClaimed(
        uint poolIndex,
        address staker,
        uint amountQspWei
    );
    
    event StakerRefundClaimed(
      uint poolIndex,
      address staker,
      uint amountQspWei
    );

    // Signals that a stakeholder has withdrawn a claim
    event ClaimWithdrawn(uint poolId, uint balanceQspWei);

    // Signals that staker has staked amountQspWei at poolIndex
    event StakePlaced(uint poolIndex, address staker, uint amountQspWei);

    // Signals that a stake has been withdrawn
    event StakeWithdrawn(uint poolIndex, address staker, uint amountWithdrawnQspWei);

    // Signals that the state of the pool has changed
    event StateChanged(uint poolIndex, PoolState state);

    /* Allwos execution only when the policy of the pool is violated.
    * @param poolIndex - index of the pool where the policy is checked
    */
    modifier whenViolated(uint poolIndex) {
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        require(IPolicy(poolPolicy).isViolated(candidateContract) || 
            getPoolState(poolIndex) == PoolState.ViolatedFunded ||
            getPoolState(poolIndex) == PoolState.ViolatedUnderfunded,
            "Contract policy is not violated.");
        _;
    }

    /* Allwos execution only when the policy of the pool is not violated.
    * @param poolIndex - index of the pool where the policy is checked
    */
    modifier whenNotViolated(uint poolIndex) {
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        require(!IPolicy(poolPolicy).isViolated(candidateContract) &&
            getPoolState(poolIndex) != PoolState.ViolatedFunded &&
            getPoolState(poolIndex) != PoolState.ViolatedUnderfunded,
            "Contract policy is violated.");
        _;
    }

    /* Allwos execution only when the pool owner is the msg.sender.
    * @param poolIndex - index of the pool
    */
    modifier onlyPoolOwner(uint poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        require(poolOwner == msg.sender, "Msg.sender is not pool owner.");
        _;
    }

    /**
    * Initializes the Quality Assurance Protocol
    * @param tokenAddress - the address of the QSP Token contract
    * @param tcrAddress - the address of the security expert token curated registry
    */
    constructor(address tokenAddress, address tcrAddress) public {
        balanceQspWei = 0;
        currentPoolNumber = 0;
        require(tokenAddress != address(0), "Token address is 0.");
        token = StandardToken(tokenAddress);
        require(tcrAddress != address(0), "TCR address is 0.");
        stakingRegistry = Registry(tcrAddress);
    }

    /**
    * Gives all the staked funds to the stakeholder provided that the policy was violated and the
    * state of the contract allows.
    * @param poolIndex - the index of the pool where the claim will be withdrawn
    */
    function withdrawClaim(uint poolIndex) public whenViolated(poolIndex) onlyPoolOwner(poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        PoolState currentState = getPoolState(poolIndex);
        require(currentState != PoolState.ViolatedUnderfunded);
        require(currentState != PoolState.Cancelled);

        /* todo(mderka) Consider design the does not require iteration over stakes
           created SP-45 */ 
        // claim all stakes
        uint total = getPoolDepositQspWei(poolIndex);
        for (uint i = 0; i < stakes[poolIndex].length; i++) {
            Stake storage stake = stakes[poolIndex][i];
            /* todo(mderka) Is this attribute necessary? It can be read using
               balanceOf in ERC20. Created SP-44. */
            total = total.add(stake.amountQspWei);
            stake.amountQspWei = 0;
        }
        require(token.transfer(poolOwner, total),
            "Token transfer failed during withdrawClaim");
        balanceQspWei = balanceQspWei.sub(total);
        pools[poolIndex].depositQspWei = 0;
        setState(poolIndex, PoolState.ViolatedFunded);

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

    /**
    * Creates a new staking pool.
    * @param candidateContract - the contract that must be protected
    * @param contractPolicy - the policy that must be respected by the candidate contract
    * @param maxPayoutQspWei - the maximum payout that will be awarded to all stakers per payout period
    * @param minStakeQspWei - the minimum value that needs to be raised from all stakers together
    * @param depositQspWei - the current value deposited by the owner/stakeholder
    * @param bonusExpertFactor - the factor by which the payout of an expert is multiplied
    * @param bonusFirstExpertFactor - the factor by which the payout of the first expert is multiplied
    * @param payPeriodInBlocks - the number of blocks after which stakers are payed incentives, in case of no breach
    * @param minStakeTimeInBlocks - the minimum number of blocks that funds need to be staked for
    * @param timeoutInBlocks - the number of blocks after which a pool is canceled if there are not enough stakes
    * @param urlOfAuditReport - a URL to some audit report (could also be a white-glove audit)
    */
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
        require(depositQspWei > 0, "Deposit is not positive when creating a pool.");
        // transfer tokens to this contract
        require(token.transferFrom(msg.sender, address(this), depositQspWei));

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

    /// @dev addr is of type Address which is 20 Bytes, but the TCR expects all
    /// entries to be of type Bytes32. addr is first cast to Uint256 so that it
    /// becomes 32 bytes long, addr is then shifted 12 bytes (96 bits) to the
    /// left so the 20 important bytes are in the correct spot.
    /// @param addr The address of the person who may be an expert.
    /// @return true If addr is on the TCR (is an expert)
    function isExpert(address addr) public view returns(bool) {
        return stakingRegistry.isWhitelisted(bytes32(uint256(addr) << 96));
    }

    /**
    * Sets the state of the pool to a given state, while also marking the block at
    * which this occured and emitting an event corresponding to the new state.
    * @param poolIndex - the index of the pool for which the state is changed
    * @param newState - the new state to which the pool will change
    */
    function setState(uint poolIndex, PoolState newState) internal {
        PoolState poolState = getPoolState(poolIndex);
        if (poolState != newState) {
            pools[poolIndex].state = newState; // set the state
            pools[poolIndex].timeOfStateInBlocks = block.number; // set the time when the state changed
            emit StateChanged(poolIndex, newState); // emit an event that the state has changed
        }
    }

    /**
    * Checks the policy of the pool. If it is violated, it updates the state accordingly.
    * Fails the transaction otherwise.
    * @param poolIndex - the index of the pool for which the state is changed
    */
    function checkPolicy(uint poolIndex) public {
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        // fail loud if the policy has not been violated
        require (IPolicy(poolPolicy).isViolated(candidateContract));

        PoolState state = getPoolState(poolIndex);
        if (state == PoolState.Initialized) {
            setState(poolIndex, PoolState.Cancelled);
        } else if (state == PoolState.NotViolatedUnderfunded) {
            setState(poolIndex, PoolState.ViolatedUnderfunded);
        } else if (state == PoolState.NotViolatedFunded) {
            setState(poolIndex, PoolState.ViolatedFunded);
        }
    }

    /**
    * TODO (sebi): This function needs to be replaced by a better solution as part of SP-44
    * Returns the total number of QSP Wei stakes in the pool.
    * @param poolIndex - the index of the pool for which the total is computed
    */
    function getTotalFundsStaked(uint poolIndex) internal view returns(uint) {
        uint total = 0;
        for (uint i = 0; i < stakes[poolIndex].length; i++) {
            Stake memory stake = stakes[poolIndex][i];
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
            (state == PoolState.NotViolatedFunded),
            "Pool is not in the right state when staking funds.");

        // Check if pool can be switched from the initialized state to another state
        if ((state == PoolState.Initialized) &&
            (getPoolTimeoutInBlocks(poolIndex) <= block.number.sub(getPoolTimeOfStateInBlocks(poolIndex)))) {
                // then timeout has occured and stakes are not allowed
                setState(poolIndex, PoolState.Cancelled);
                return;
        }
            
        // If policy is not violated then transfer the stake
        require(token.transferFrom(msg.sender, address(this),  amountQspWei),
            "Token transfer failed when staking funds.");

        // Create new Stake struct
        Stake memory stake = Stake(msg.sender, amountQspWei, block.number);
        stakes[poolIndex].push(stake);
        totalStakes[poolIndex][msg.sender] = totalStakes[poolIndex][msg.sender].add(amountQspWei);
        balanceQspWei = balanceQspWei.add(amountQspWei);
        
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

    /**
    * Allows the staker to withdraw all their stakes from the pool.
    * @param poolIndex - the index of the pool from which the stake is withdrawn
    */
    function withdrawStake(uint poolIndex) external {
        PoolState state = getPoolState(poolIndex);
        require(state == PoolState.Initialized || 
            state == PoolState.NotViolatedUnderfunded || 
            state == PoolState.Cancelled ||
            (state == PoolState.NotViolatedFunded && 
                getPoolTimeOfStateInBlocks(poolIndex) >= getPoolMinStakeTimeInBlocks(poolIndex)),
            "Pool is not in the right state when withdrawing stake.");

        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        require(!IPolicy(poolPolicy).isViolated(candidateContract));

        uint totalQspWeiTransfer = 0;
        for (uint i = 0; i < stakes[poolIndex].length; i++) {
            Stake memory stake = stakes[poolIndex][i];
            if (stake.staker == msg.sender) {
                pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.sub(stake.amountQspWei);
                balanceQspWei = balanceQspWei.sub(stake.amountQspWei);
                totalStakes[poolIndex][msg.sender] = totalStakes[poolIndex][msg.sender].sub(stake.amountQspWei);
                totalQspWeiTransfer = totalQspWeiTransfer.add(stake.amountQspWei);
                stakes[poolIndex][i].amountQspWei = 0;
            }
        }

        if (totalQspWeiTransfer > 0) {
            require(token.transfer(msg.sender, totalQspWeiTransfer));
            emit StakeWithdrawn(poolIndex, msg.sender, totalQspWeiTransfer);
            if (getPoolMinStakeQspWei(poolIndex) > getTotalFundsStaked(poolIndex)) {
                setState(poolIndex, PoolState.Cancelled);
            }
        }
    }

    /*
    * Allows the stakeholder to make an additional deposit to the contract
    */
    function depositFunds(uint poolIndex, uint depositQspWei) external onlyPoolOwner(poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        PoolState currentState = getPoolState(poolIndex);

        require(currentState == PoolState.NotViolatedFunded
                  || currentState == PoolState.Initialized
                  || currentState == PoolState.NotViolatedUnderfunded
               );

        require(token.transferFrom(poolOwner, address(this), depositQspWei),
            'Token deposit transfer did not succeed');
        pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.add(depositQspWei);
        balanceQspWei = balanceQspWei.add(depositQspWei);

        if (currentState == PoolState.NotViolatedUnderfunded
            && depositQspWei >= getPoolMaxPayoutQspWei(poolIndex)) {
                setState(poolIndex, PoolState.NotViolatedFunded);
        }

        emit DepositMade(poolIndex, poolOwner, depositQspWei);
    }

    /*
    * Allows the stakeholder to withdraw their entire deposits from the contract
    * if the policy is not violated
    */
    function withdrawDeposit(uint poolIndex) external whenNotViolated(poolIndex) onlyPoolOwner(poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        PoolState currentState = getPoolState(poolIndex);
        require(currentState == PoolState.NotViolatedFunded
                  || currentState == PoolState.Initialized
                  || currentState == PoolState.NotViolatedUnderfunded
                  || currentState == PoolState.Cancelled
               );

        uint withdrawalAmountQspWei = pools[poolIndex].depositQspWei;
        require(withdrawalAmountQspWei > 0, 'The staker has no balance to withdraw');
        pools[poolIndex].depositQspWei = 0;
        balanceQspWei = balanceQspWei.sub(withdrawalAmountQspWei);
        require(token.transfer(poolOwner, withdrawalAmountQspWei), 'Token withdrawal transfer did not succeed');
        setState(poolIndex, PoolState.Cancelled);
        emit DepositWithdrawn(poolIndex, poolOwner, withdrawalAmountQspWei);
    }

    /*
    * Allows the stakeholder to make an additional deposit to the contract
    */
    function depositFunds(uint poolIndex, uint depositQspWei) external {
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
    * Allows the stakeholder to withdraw their entire deposits from the contract
    * if the policy is not violated
    */
    function withdrawDeposit(uint poolIndex) external whenNotViolated(poolIndex) {
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
      setState(poolIndex, PoolState.Cancelled);
      emit DepositWithdrawn(poolIndex, poolOwner, withdrawalAmountQspWei);
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
}
