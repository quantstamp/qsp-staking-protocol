pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author

import {Registry} from "./test/Registry.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "./IPolicy.sol";

contract QuantstampStaking is Ownable {
    using SafeMath for uint256;
    using Math for uint256;

    struct Stake {
        address staker; // the address of the staker
        uint amountQspWei; // the amount staked by the staker
        uint blockNumber; // the Block number when this stake was made
        uint lastPayoutBlock; // the Block number where the last payout was made to this staker
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
        address firstExpertStaker; // the address of the first expert to stake in this pool
        uint payPeriodInBlocks; // the number of blocks after which stakers are payed incentives, in case of no breach
        uint minStakeTimeInBlocks; // the minimum number of blocks that funds need to be staked for
        uint timeoutInBlocks; // the number of blocks after which a pool is canceled if there are not enough stakes
        uint timeOfStateInBlocks; // the block number when the pool was set in its current state
        string urlOfAuditReport; // a URL to some audit report (could also be a white-glove audit)
        PoolState state; // the current state of the pool
        uint totalStakeQspWei; // total amount of stake contributed so far
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

    // Signals that a stakeholder has withdrawn a claim
    event ClaimWithdrawn(uint poolId, uint balanceQspWei);

    // Signals that staker has staked amountQspWei at poolIndex
    event StakePlaced(uint poolIndex, address staker, uint amountQspWei, uint block);

    // Signals that a stake has been withdrawn
    event StakeWithdrawn(uint poolIndex, address staker, uint amountWithdrawnQspWei);

    // Signals that a staker has received a payout
    event StakerReceivedPayout(uint poolIndex, address staker, uint amount);

    // Signals that the state of the pool has changed
    event StateChanged(uint poolIndex, PoolState state, uint block);

    // Signals that the payout block was updated
    event LastPayoutBlockUpdate(uint poolIndex, address staker, uint block);

    /* Allows execution only when the policy of the pool is violated.
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

    /* Allows execution only when the policy of the pool is not violated.
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

    /* Allows execution only when the pool owner is the msg.sender.
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
        uint total = getPoolDepositQspWei(poolIndex).add(pools[poolIndex].totalStakeQspWei);
        require(token.transfer(poolOwner, total),
            "Token transfer failed during withdrawClaim");
        balanceQspWei = balanceQspWei.sub(total);
        pools[poolIndex].depositQspWei = 0;
        pools[poolIndex].totalStakeQspWei = 0;
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

    function getPoolFirstExpertStaker(uint index) public view returns(address) {
        return pools[index].firstExpertStaker;
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

    function getPoolTotalStakeQspWei(uint index) public view returns(uint) {
        return pools[index].totalStakeQspWei;
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
            address(0), // no expert staker
            payPeriodInBlocks,
            minStakeTimeInBlocks,
            timeoutInBlocks,
            block.number,
            urlOfAuditReport,
            PoolState.Initialized,
            0 // the initial total stake is 0
        );
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
            emit StateChanged(poolIndex, newState, pools[poolIndex].timeOfStateInBlocks); // emit an event that the state has changed
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
        require(token.transferFrom(msg.sender, address(this), amountQspWei),
            "Token transfer failed when staking funds.");

        // Create new Stake struct. The value of the last parameter indicates that a payout has not be made yet.
        Stake memory stake = Stake(msg.sender, amountQspWei, block.number, block.number);
        stakes[poolIndex].push(stake);
        totalStakes[poolIndex][msg.sender] = totalStakes[poolIndex][msg.sender].add(amountQspWei);
        balanceQspWei = balanceQspWei.add(amountQspWei);
        pools[poolIndex].totalStakeQspWei = pools[poolIndex].totalStakeQspWei.add(amountQspWei);
        // Set first expert if it is not set and the staker is an expert on the TCR
        if (getPoolFirstExpertStaker(poolIndex) == address(0) && isExpert(msg.sender)) {
            pools[poolIndex].firstExpertStaker = msg.sender;
        }

        // Check if there are enough stakes in the pool
        if (getPoolTotalStakeQspWei(poolIndex) >= getPoolMinStakeQspWei(poolIndex)) { // Minimum staking value was reached
            if (getPoolDepositQspWei(poolIndex) >= getPoolMaxPayoutQspWei(poolIndex)) {
                // The pool is funded by enough to pay stakers
                setState(poolIndex, PoolState.NotViolatedFunded);
            } else {
                // The pool is does not have enough funds to pay stakers
                setState(poolIndex, PoolState.NotViolatedUnderfunded);
            }
        }
        emit StakePlaced(poolIndex, msg.sender, amountQspWei, stake.blockNumber);
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

        uint totalQspWeiTransfer = totalStakes[poolIndex][msg.sender];

        if (totalQspWeiTransfer > 0) {
            require(token.transfer(msg.sender, totalQspWeiTransfer));
            pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.sub(totalQspWeiTransfer);
            balanceQspWei = balanceQspWei.sub(totalQspWeiTransfer);
            totalStakes[poolIndex][msg.sender] = 0;
            pools[poolIndex].totalStakeQspWei = pools[poolIndex].totalStakeQspWei.sub(totalQspWeiTransfer);

            emit StakeWithdrawn(poolIndex, msg.sender, totalQspWeiTransfer);
            if (getPoolMinStakeQspWei(poolIndex) > getPoolTotalStakeQspWei(poolIndex)) {
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

    /**
    * Computes the total amount due to for the staker payout when the contract is not violated.
    * maxPayout * (amountStaked [* (1+bonusExpert)^i][* (1+bonusFirstExp)] )/poolSize
    * where [* (1+bonusExpert)^i] is applied if the staker is the ith expert to stake,
    * and [* (1+bonusFirstExp)] applies additionally in the case of the first expert;
    * maxPayout is specified by the stakeholder who created the pool;
    * poolSize is the size of all stakes in this pool together with the bonuses awarded for experts;
    * amountStaked is the amount contributed by a staker.
    * @param poolIndex - the pool from which the payout is awarded
    * @param staker - the staker to which the payout should be awarded
    * @return - the amount of QSP Wei that should be awarded
    */
    function computePayout(uint poolIndex, address staker) public view returns(uint) {
        uint poolSize = 0; // the total amount of QSP Wei staked in this pool (denominator of the return fraction)
        uint bonusExpertAtPower = 1; // this holds bonusExpert raised to a power to avoid the ** operator
        uint bonusExpertPlus100 = getPoolBonusExpertFactor(poolIndex).add(100);
        uint powersOf100 = 1; // it holds the next power of 100 at every iteration of the loop
        uint numerator = 0; // indicates the unnormalized total payout for the staker

        if (stakes[poolIndex].length <= 0) { // no stakes have been placed yet
            return 0;
        }
        // compute the total amount (with expert bonuses) staked in the pool and
        // gather the indices (order) where the staker has staked
        uint i = stakes[poolIndex].length;
        do {
            i = i - 1;
            uint stakeAmount = stakes[poolIndex][i].amountQspWei;
            // check if the staker is an expert
            if (isExpert(stakes[poolIndex][i].staker)) {
                stakeAmount = stakeAmount.mul(bonusExpertAtPower).div(powersOf100);
                /* Check if it is the first expert
                * Assumption: Non-experts can stake before experts, which means that
                * the first element in the stakes array may be a non-expert.
                */
                if (getPoolFirstExpertStaker(poolIndex) == stakes[poolIndex][i].staker) {
                    stakeAmount = stakeAmount.mul(getPoolBonusFirstExpertFactor(poolIndex).add(100)).div(100);
                }
            }
            poolSize = poolSize.add(stakeAmount);
            if (stakes[poolIndex][i].staker == staker) {
                // the state does not need to be changed at this point. It is not problem if it changes.
                // the reason for this assignment is that no more local variables can be declared in this function.
                stakes[poolIndex][i].blockNumber = Math.max256(stakes[poolIndex][i].blockNumber, getPoolTimeOfStateInBlocks(poolIndex));
                // multiply the stakeAmount by the number of payPeriods for which the stake has been active and not payed out
                stakeAmount = stakeAmount.mul((block.number - stakes[poolIndex][i].blockNumber)/getPoolPayPeriodInBlocks(poolIndex)-
                    (stakes[poolIndex][i].lastPayoutBlock - stakes[poolIndex][i].blockNumber)/getPoolPayPeriodInBlocks(poolIndex));
                numerator = numerator.add(stakeAmount);
            }
            bonusExpertAtPower = bonusExpertAtPower.mul(bonusExpertPlus100);
            powersOf100 = powersOf100.mul(100);
        } while (i > 0);

        if (poolSize == 0) { // all stakes have been withdrawn
            return 0;
        }
        return numerator.mul(getPoolMaxPayoutQspWei(poolIndex)).div(poolSize);
    }
    
    /**
    * In case the pool is not violated and the payPeriod duration has passed, it computes the payout of the staker
    * and if the payout value is positive it transfers the corresponding amout from the pool to the staker.
    * @param poolIndex - the index of the pool from which the staker wants to receive a payout
    * @param staker - the address of the staker who wants to receive the payout
    */
    function withdrawInterest(uint poolIndex, address staker) external whenNotViolated(poolIndex) {
        // check that the state of the pool is NotViolatedFunded
        require(getPoolState(poolIndex) == PoolState.NotViolatedFunded,
            "The state of the pool is not NotViolatedFunded, as expected.");
        // check that enough time (blocks) has passed since the pool has collected stakes totaling at least minStakeQspWei
        require(block.number > (getPoolPayPeriodInBlocks(poolIndex) + getPoolTimeOfStateInBlocks(poolIndex)),
            "Not enough time has passed since the pool is active or the stake was placed.");
        
        // compute payout due to be payed to the staker
        uint payout = computePayout(poolIndex, staker);
        require(payout > 0, "Cannot withdraw non-positive payout");
        // check if the are enough funds in the pool deposit
        if (getPoolDepositQspWei(poolIndex) >= payout) { // transfer the funds
            pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.sub(payout);
            balanceQspWei = balanceQspWei.sub(payout);
            for (uint i = 0; i < stakes[poolIndex].length; i++) {
                if (stakes[poolIndex][i].staker == staker) {
                    stakes[poolIndex][i].blockNumber = Math.max256(stakes[poolIndex][i].blockNumber, getPoolTimeOfStateInBlocks(poolIndex));
                    if ((block.number - stakes[poolIndex][i].blockNumber)/getPoolPayPeriodInBlocks(poolIndex) >
                        (stakes[poolIndex][i].lastPayoutBlock - stakes[poolIndex][i].blockNumber)/getPoolPayPeriodInBlocks(poolIndex)) {
                        stakes[poolIndex][i].lastPayoutBlock = block.number;
                        LastPayoutBlockUpdate(poolIndex, staker, stakes[poolIndex][i].lastPayoutBlock);
                    }
                }
            }
            
            require(token.transfer(staker, payout),
                "Could not transfer the payout to the staker.");
            
            emit StakerReceivedPayout(poolIndex, staker, payout);
        } else { // place the pool in a Cancelled state
            setState(poolIndex, PoolState.Cancelled);
        }
    }
}
