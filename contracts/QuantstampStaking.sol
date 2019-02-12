pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author Quantstamp

import {Registry} from "./test/Registry.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "./IPolicy.sol";
import "./IRegistry.sol";


contract QuantstampStaking is Ownable {
    using SafeMath for uint256;
    using Math for uint256;

    uint constant internal MAX_UINT = ~uint(0);

    // state of the pool's lifecycle
    enum PoolState {
        None,
        Initialized, // insuffucient stakes
        NotViolatedUnderfunded, // sufficient stakes, insufficient deposit
        ViolatedUnderfunded, // sufficient stakes, insufficient deposit, violated
        NotViolatedFunded,  // sufficient stakes, sufficient deposit
        ViolatedFunded, // sufficient stakes, sufficient deposit, violated
        Cancelled,
        PolicyExpired // similar to Cancelled, but in this state stakers can request and receive payouts which are due
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
        address firstExpertStaker; // the address of the first expert in the pool
        uint payPeriodInBlocks; // the number of blocks after which stakers are payed incentives, in case of no breach
        uint minStakeTimeInBlocks; // the minimum number of blocks that funds need to be staked for
        uint timeoutInBlocks; // the number of blocks after which a pool is canceled if there are not enough stakes
        uint timeOfStateInBlocks; // the block number when the pool was set in its current state
        string urlOfAuditReport; // a URL to some audit report (could also be a white-glove audit)
        PoolState state; // the current state of the pool
        uint totalStakeQspWei; // total amount of stake contributed so far
        uint poolSizeQspWei; // the size of all stakes in this pool together with the bonuses awarded for experts
        uint stakeCount; // the total number of stakes in the pool
        string poolName; // an alphanumeric string defined by the pool owner
        uint maxTotalStakeQspWei; // The maximum amount that can be staked in this pool
    }

    struct Stake {
        address staker; // the address of the staker
        uint amountQspWei; // the amount staked by the staker
        uint blockPlaced; // the Block number when this stake was made
        uint lastPayoutBlock; // the Block number where the last payout was made to this staker
        uint contributionIndex; // the absolute index of the stake in the pool (numbering starts with 1)
        bool expertStake; // true iff the staker was on the TCR when the stake was placed
    }

    // A mapping from pool hash onto the inner mapping that defines individual stakes contributed by each staker
    // address (the inner mapping's key) into the pool
    mapping (uint => mapping(address => Stake[])) public stakes;

    // A mapping from pool hash onto a list of stakers in that pool in the order in which the have placed their stakes
    mapping (uint => address[]) public poolToStakers;

    // A maping from pool hash onto a list of booleans indicating if that poolToStakers entry is an expert or not
    mapping (uint => bool[]) public poolToStakersExpertStatus;

    // A mapping from pool hash onto a reverse index for the list of stakers in that given pool
    mapping (uint => mapping (address => uint)) public poolToStakerIndex;

    // Total stakes contributed by each staker address into the pool defined by a pool hash (the mapping's key)
    mapping (uint => mapping(address => uint)) public totalStakes;

    // Holds the expert bonus corresponding to the i-th staker of the pool given by the key of the mapping
    mapping (uint => uint[]) public bonusExpertAtPower;

    // Holds the powers of 100 corresponding to the i-th staker of
    // the pool given by the key of the mapping. This will be used as the divisor when computing payouts
    mapping (uint => uint[]) public powersOf100;

    // All pools including active and canceled pools
    mapping (uint => Pool) internal pools;

    // Mapps pool names to n iff that pool was the n-th pool created (n > 0)
    mapping (string => uint) internal poolNameToPoolIndex;

    // The total balance of the contract including all stakes and deposits
    uint public balanceQspWei;

    // Current number of pools
    uint internal currentPoolNumber;

    // Token used to make deposits and stakes. This contract assumes that the owner of the contract
    // trusts token's code and that transfer function (e.g. transferFrom, transfer) work correctly.
    ERC20 public token;

    // TCR used to list expert stakers.
    IRegistry public stakingRegistry;

    // Signals that a stakeholder has made a deposit
    event DepositMade(uint poolIndex, address actor, uint amountQspWei);

    // Signals that a stakeholder has withdrawn the deposit
    event DepositWithdrawn(uint poolIndex, address actor, uint amountQspWei);

    // Signals that a staker has claimed a refund
    event StakerRefundClaimed(uint poolIndex, address staker, uint amountQspWei);

    // Signals that a stakeholder has withdrawn a claim
    event ClaimWithdrawn(uint poolId, uint balanceQspWei);

    // Signals that staker has staked amountQspWei at poolIndex
    event StakePlaced(uint poolIndex, address staker, uint amountQspWei);

    // Signals that a stake has been withdrawn
    event StakeWithdrawn(uint poolIndex, address staker, uint amountWithdrawnQspWei);

    // Signals that a staker has received a payout
    event StakerReceivedPayout(uint poolIndex, address staker, uint amount);

    // Signals that the state of the pool has changed
    event StateChanged(uint poolIndex, PoolState state);

    // Signals that the payout block was updated
    event LastPayoutBlockUpdate(uint poolIndex, address staker);

    // Indicates registry update
    event RegistryUpdated(address newRegistry);

    /** Allows execution only when the policy of the pool is not violated.
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

    /** Allows execution only when the pool owner is the msg.sender.
    * @param poolIndex - index of the pool
    */
    modifier onlyPoolOwner(uint poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        require(poolOwner == msg.sender, "Msg.sender is not pool owner.");
        _;
    }

    /** Initializes the Quality Assurance Protocol
    * @param tokenAddress - the address of the QSP Token contract
    * @param tcrAddress - the address of the security expert token curated registry
    */
    constructor(address tokenAddress, address tcrAddress) public {
        balanceQspWei = 0;
        currentPoolNumber = 0;
        require(tokenAddress != address(0), "Token address is 0.");
        token = ERC20(tokenAddress);
        require(tcrAddress != address(0), "TCR address is 0.");
        stakingRegistry = IRegistry(tcrAddress);
    }

    /** Allows the stakeholder to make an additional deposit to the contract
    * @param poolIndex - the index of the pool into which funds needs to be deposited
    * @param depositQspWei - the amount to be deposited into de pool
    */
    function depositFunds(
        uint poolIndex,
        uint depositQspWei
    ) external onlyPoolOwner(poolIndex) whenNotViolated(poolIndex) {
        address poolOwner = getPoolOwner(poolIndex);
        PoolState state = updatePoolState(poolIndex);
        require(state == PoolState.Initialized ||
            state == PoolState.NotViolatedUnderfunded ||
            state == PoolState.NotViolatedFunded ||
            state == PoolState.PolicyExpired);
        require(token.transferFrom(poolOwner, address(this), depositQspWei),
            "Token deposit transfer did not succeed");
        pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.add(depositQspWei);
        balanceQspWei = balanceQspWei.add(depositQspWei);

        if (state == PoolState.NotViolatedUnderfunded
                && pools[poolIndex].depositQspWei >= getPoolMaxPayoutQspWei(poolIndex)) {
            setState(poolIndex, PoolState.NotViolatedFunded);
        }

        emit DepositMade(poolIndex, poolOwner, depositQspWei);
    }

    /** Allows the stakeholder to withdraw their entire deposits from the contract
    * if the policy is not violated
    * @param poolIndex - the index of the pool from which the deposit should be withdrawn
    */
    function withdrawDeposit(uint poolIndex) external onlyPoolOwner(poolIndex) {
        PoolState state = updatePoolState(poolIndex);
        /* If the policy is expired do not let the stakeholder withdraw his deposit until all stakers are payed out or
        * if the minimum time for staking has passed twice since the pool transitioned into the NotViolated funded state
        */
        if (state == PoolState.PolicyExpired && getPoolTotalStakeQspWei(poolIndex) > 0 &&
            getPoolTimeOfStateInBlocks(poolIndex).add(getPoolMinStakeTimeInBlocks(poolIndex).mul(2)) > block.number) {
            return;
        }
        address poolOwner = getPoolOwner(poolIndex);
        require(state == PoolState.Initialized || // always allow to withdraw in these states
            state == PoolState.NotViolatedUnderfunded ||
            state == PoolState.PolicyExpired ||
            state == PoolState.NotViolatedFunded ||
            state == PoolState.Cancelled,
            "Pool is not in the right state when withdrawing deposit.");
        uint withdrawalAmountQspWei = pools[poolIndex].depositQspWei;
        require(withdrawalAmountQspWei > 0, "The stakeholder has no balance to withdraw");
        pools[poolIndex].depositQspWei = 0;
        balanceQspWei = balanceQspWei.sub(withdrawalAmountQspWei);
        require(token.transfer(poolOwner, withdrawalAmountQspWei), "Token withdrawal transfer did not succeed");
        setState(poolIndex, PoolState.Cancelled);
        emit DepositWithdrawn(poolIndex, poolOwner, withdrawalAmountQspWei);
    }

    /** Allows the staker to withdraw all their stakes from the pool.
    * @param poolIndex - the index of the pool from which the stake is withdrawn
    */
    function withdrawStake(uint poolIndex) external {
        PoolState state = getPoolState(poolIndex);
        // State check
        bool expired = 
            block.number >= getPoolMinStakeTimeInBlocks(poolIndex).add(getPoolTimeOfStateInBlocks(poolIndex));
        require(state == PoolState.Initialized ||
            state == PoolState.NotViolatedUnderfunded ||
            state == PoolState.NotViolatedFunded && expired ||
            state == PoolState.Cancelled ||
            state == PoolState.PolicyExpired,
            "Pool is not in the right state when withdrawing stake.");

        // Effect
        uint totalQspWeiTransfer = totalStakes[poolIndex][msg.sender];
        if (totalQspWeiTransfer > 0) { 
            // transfer the stake back
            balanceQspWei = balanceQspWei.sub(totalQspWeiTransfer);
            totalStakes[poolIndex][msg.sender] = 0;
            pools[poolIndex].totalStakeQspWei = pools[poolIndex].totalStakeQspWei.sub(totalQspWeiTransfer);
            
            // this loop is needed, because the computePayout function uses the stakes array
            for (uint i = 0; i < stakes[poolIndex][msg.sender].length; i++) {
                pools[poolIndex].poolSizeQspWei = pools[poolIndex].poolSizeQspWei.sub(
                    calculateStakeAmountWithBonuses(poolIndex, msg.sender, i));
                stakes[poolIndex][msg.sender][i].amountQspWei = 0;
            }
            
            // remove this staker from the list of stakers of this pool
            delete poolToStakers[poolIndex][poolToStakerIndex[poolIndex][msg.sender]];
            delete poolToStakersExpertStatus[poolIndex][poolToStakerIndex[poolIndex][msg.sender]];
            
            // the actual transfer
            require(token.transfer(msg.sender, totalQspWeiTransfer));
            emit StakeWithdrawn(poolIndex, msg.sender, totalQspWeiTransfer);
        }
        
        // State transition
        updateStateWithdrawStake(poolIndex);
    }

    /** In case the pool is not violated and the payPeriod duration has passed, it computes the payout of the staker
    * (defined by msg.sender),
    * and if the payout value is positive it transfers the corresponding amout from the pool to the staker.
    * @param poolIndex - the index of the pool from which the staker wants to receive a payout
    */
    function withdrawInterest(uint poolIndex) external whenNotViolated(poolIndex) {
        // update the state of the pool if necessary
        PoolState state = updatePoolState(poolIndex);
        // check that the state of the pool
        require(state == PoolState.NotViolatedFunded ||
            state == PoolState.PolicyExpired,
            "The state of the pool is not as expected.");
        // check that enough time (blocks) has passed since the pool has collected stakes totaling
        // at least minStakeQspWei
        require(block.number > (getPoolPayPeriodInBlocks(poolIndex).add(getPoolTimeOfStateInBlocks(poolIndex))),
            "Not enough time has passed since the pool is active or the stake was placed.");
        // compute payout due to be payed to the staker
        uint payout = computePayout(poolIndex, msg.sender);
        if (payout == 0) // no need to transfer anything
            return;
        // check if the are enough funds in the pool deposit
        if (getPoolDepositQspWei(poolIndex) >= payout) { // transfer the funds
            pools[poolIndex].depositQspWei = pools[poolIndex].depositQspWei.sub(payout);
            balanceQspWei = balanceQspWei.sub(payout);
            for (uint i = 0; i < stakes[poolIndex][msg.sender].length; i++) {
                stakes[poolIndex][msg.sender][i].blockPlaced = Math.max(stakes[poolIndex][msg.sender][i].blockPlaced,
                        getPoolTimeOfStateInBlocks(poolIndex));
                uint numberOfPayouts = getNumberOfPayoutsForStaker(poolIndex, i, msg.sender,
                        stakes[poolIndex][msg.sender][i].blockPlaced);
                if (numberOfPayouts > 0) {
                    stakes[poolIndex][msg.sender][i].lastPayoutBlock = block.number;
                    emit LastPayoutBlockUpdate(poolIndex, msg.sender);
                }
            }

            require(token.transfer(msg.sender, payout),
                "Could not transfer the payout to the staker.");
            emit StakerReceivedPayout(poolIndex, msg.sender, payout);
        } else if (state != PoolState.PolicyExpired) { // place the pool in a Cancelled state
            setState(poolIndex, PoolState.Cancelled);
        }
    }

    /** Checks if the given address is a staker of the given pool index
    * @param poolIndex - the index of the pool where to check for stakers
    * @param staker - the address of the staker to check for
    * @return - true if the staker has a stake in the pool, false otherwise
    */
    function isStaker(uint poolIndex, address staker) external view returns(bool) {
        return (stakes[poolIndex][staker].length > 0) && (totalStakes[poolIndex][staker] > 0);
    }

    /** Gives all the staked funds to the stakeholder provided that the policy was violated and the
    * state of the contract allows.
    * @param poolIndex - the index of the pool where the claim will be withdrawn
    */
    function withdrawClaim(uint poolIndex) public onlyPoolOwner(poolIndex) {
        PoolState state = updatePoolState(poolIndex);
        // allowed IFF the pool is in the not violated state (yet) but the policy has been violated
        // or the pool is in ViolatedFunded state already
        require(
            (state == PoolState.ViolatedFunded) ||
            (state == PoolState.NotViolatedFunded && isViolated(poolIndex))
        );

        // claim all stakes
        uint total = getPoolDepositQspWei(poolIndex).add(pools[poolIndex].totalStakeQspWei);
        balanceQspWei = balanceQspWei.sub(total);
        pools[poolIndex].depositQspWei = 0;
        pools[poolIndex].totalStakeQspWei = 0;
        pools[poolIndex].poolSizeQspWei = 0;
        setState(poolIndex, PoolState.ViolatedFunded);
        require(token.transfer(getPoolOwner(poolIndex), total),
            "Token transfer failed during withdrawClaim");
        emit ClaimWithdrawn(poolIndex, total);
    }
    
    /** Transfers an amount of QSP from the staker to the pool
    * @param poolIndex - the index of the pool where the funds are transferred to
    * @param amountQspWei - the amount of QSP Wei that is transferred
    */
    function stakeFunds(uint poolIndex, uint amountQspWei) public whenNotViolated(poolIndex) {
        PoolState state = updatePoolState(poolIndex);
        require((state == PoolState.Initialized) ||
            (state == PoolState.NotViolatedUnderfunded) ||
            (state == PoolState.NotViolatedFunded), "Pool is not in the right state when staking funds.");
        // Check if pool can be switched from the initialized state to another state
        if ((state == PoolState.Initialized) && // then timeout has occured and stakes are not allowed
            (getPoolTimeoutInBlocks(poolIndex) <= block.number.sub(getPoolTimeOfStateInBlocks(poolIndex)))) {
            setState(poolIndex, PoolState.Cancelled);
            return;
        }
        uint adjustedAmountQspWei = updateStakeAmount(poolIndex, amountQspWei);
        // If policy is not violated then transfer the stake
        require(token.transferFrom(msg.sender, address(this), adjustedAmountQspWei),
            "Token transfer failed when staking funds.");
        pools[poolIndex].stakeCount += 1;
        uint currentStakeIndex = pools[poolIndex].stakeCount;
        // Create new Stake struct. The value of the last parameter indicates that a payout has not be made yet.
        Stake memory stake = Stake(msg.sender, adjustedAmountQspWei, block.number, block.number,
            currentStakeIndex, isExpert(msg.sender));
        stakes[poolIndex][msg.sender].push(stake);
        if (stakes[poolIndex][msg.sender].length == 1) { // then this is the first stake placed by this staker
            poolToStakers[poolIndex].push(msg.sender);
            poolToStakersExpertStatus[poolIndex].push(isExpert(msg.sender));
            poolToStakerIndex[poolIndex][msg.sender] = poolToStakers[poolIndex].length - 1;
        }
        totalStakes[poolIndex][msg.sender] = totalStakes[poolIndex][msg.sender].add(adjustedAmountQspWei);
        balanceQspWei = balanceQspWei.add(adjustedAmountQspWei);
        pools[poolIndex].totalStakeQspWei = pools[poolIndex].totalStakeQspWei.add(adjustedAmountQspWei);
        // Set first expert if it is not set and the staker is an expert on the TCR
        if (getPoolFirstExpertStaker(poolIndex) == address(0) && isExpert(msg.sender)) {
            pools[poolIndex].firstExpertStaker = msg.sender;
        }
        // Update pool size
        bonusExpertAtPower[poolIndex].push(
            bonusExpertAtPower[poolIndex][currentStakeIndex - 1].mul(getPoolBonusExpertFactor(poolIndex)));
        powersOf100[poolIndex].push(powersOf100[poolIndex][currentStakeIndex - 1].mul(100));
        pools[poolIndex].poolSizeQspWei = pools[poolIndex].poolSizeQspWei.add(
            calculateStakeAmountWithBonuses(poolIndex, msg.sender, stakes[poolIndex][msg.sender].length - 1));
        // Check if there are enough stakes in the pool
        if (getPoolTotalStakeQspWei(poolIndex) >= getPoolMinStakeQspWei(poolIndex)) {
            // Minimum staking value was reached
            if (getPoolDepositQspWei(poolIndex) >= getPoolMaxPayoutQspWei(poolIndex)) {
                // The pool is funded by enough to pay stakers
                setState(poolIndex, PoolState.NotViolatedFunded);
            } else {
                // The pool is does not have enough funds to pay stakers
                setState(poolIndex, PoolState.NotViolatedUnderfunded);
            }
        }
        emit StakePlaced(poolIndex, msg.sender, adjustedAmountQspWei);
    }

    /** Computes the un-normalized payout amount for experts (including bonuses) and non-experts
    * @param poolIndex - the index of the pool for which the payout needs to be computed
    * @param staker - the address of the staker for which the payout needs to be computed
    * @param stakeIndex - the index of the stake placed by the staker
    * @return the un-normalized payout value which is proportional to the stake amount
    */
    function calculateStakeAmountWithBonuses(
        uint poolIndex,
        address staker,
        uint stakeIndex
    ) public view returns(uint) {
        Stake memory stake = stakes[poolIndex][staker][stakeIndex];
        if (stake.amountQspWei == 0) {
            return 0;
        }
        uint stakeAmount = stake.amountQspWei;
        // check if the staker is an expert
        if (stake.expertStake) {
            stakeAmount = stakeAmount.mul(bonusExpertAtPower[poolIndex][stake.contributionIndex].
                add(powersOf100[poolIndex][stake.contributionIndex])).
                div(powersOf100[poolIndex][stake.contributionIndex]);
            /* Check if it is the first stake of the first expert */
            if (getPoolFirstExpertStaker(poolIndex) == staker && stakeIndex == 0) {
                stakeAmount = stakeAmount.mul(getPoolBonusFirstExpertFactor(poolIndex).add(100)).div(100);
            }
        }
        return stakeAmount;
    }

    /** Computes the total amount due to for the staker payout when the contract is not violated.
    * maxPayout * (amountStaked [* (1+bonusExpert^i)][* (1+bonusFirstExp)] )/poolSize
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
        uint numerator = 0; // indicates the unnormalized total payout for the staker

        if (totalStakes[poolIndex][staker] == 0) { // no stakes have been placed by this staker yet
            return 0;
        }

        if (getPoolSizeQspWei(poolIndex) == 0) { // all stakes have been withdrawn
            return 0;
        }

        // compute the numerator by adding the staker's stakes together
        for (uint i = 0; i < stakes[poolIndex][staker].length; i++) {
            uint stakeAmount = calculateStakeAmountWithBonuses(poolIndex, staker, i);
            // get the maximum between when the pool because NotViolatedFunded and the staker placed his stake
            uint startBlockNumber = Math.max(stakes[poolIndex][staker][i].blockPlaced,
                getPoolTimeOfStateInBlocks(poolIndex));
            // multiply the stakeAmount by the number of payPeriods for which the stake has been active and not payed
            stakeAmount = stakeAmount.mul(getNumberOfPayoutsForStaker(poolIndex, i, staker, startBlockNumber));
            numerator = numerator.add(stakeAmount);
        }

        return numerator.mul(getPoolMaxPayoutQspWei(poolIndex)).div(getPoolSizeQspWei(poolIndex));
    }

    /** Replaces the TCR with a new one. This function can be called only by the owner and
    * we assume that there the owner field will be set to 0x0 in the future.
    * @param _registry - the address of the TCR to used instead of the current one
    */
    function setStakingRegistry(address _registry) public onlyOwner {
        stakingRegistry = IRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    /** Checks if the addr is an expert.
    * @param addr The address of the person who may be an expert.
    * @return true If addr is an expert according to the registry
    */
    function isExpert(address addr) public view returns(bool) {
        return stakingRegistry.isExpert(addr);
    }

    /** Checks the policy of the pool. If it is violated, it updates the state accordingly.
    * Fails the transaction otherwise.
    * @param poolIndex - the index of the pool for which the state is changed
    */
    function checkPolicy(uint poolIndex) public {
        // fail loud if the policy has not been violated
        require(isViolated(poolIndex));

        PoolState state = getPoolState(poolIndex);
        if (state == PoolState.Initialized) {
            setState(poolIndex, PoolState.Cancelled);
        } else if (state == PoolState.NotViolatedUnderfunded) {
            setState(poolIndex, PoolState.ViolatedUnderfunded);
        } else if (state == PoolState.NotViolatedFunded) {
            setState(poolIndex, PoolState.ViolatedFunded);
        }
    }

    /** Creates a new staking pool.
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
    * @param poolName - an alphanumeric string defined by the pool owner
    * @param maxTotalStakeQspWei - the maximum QSP that can be staked; 0 if there is no maximum
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
        string urlOfAuditReport,
        string poolName,
        uint maxTotalStakeQspWei
    ) public {
        require(getPoolIndex(poolName) == MAX_UINT, "Cannot create a pool with the same name as an existing pool.");
        require(depositQspWei > 0, "Deposit is not positive when creating a pool.");
        // transfer tokens to this contract
        require(token.transferFrom(msg.sender, address(this), depositQspWei));
        require(maxPayoutQspWei > 0, "Maximum payout cannot be zero.");
        require(minStakeQspWei > 0, "Minimum stake cannot be zero.");
        require(payPeriodInBlocks > 0, "Pay period cannot be zero.");
        require(minStakeTimeInBlocks > 0, "Minimum staking period cannot be zero.");
        require(timeoutInBlocks > 0, "Timeout period cannot be zero.");
        require(maxTotalStakeQspWei == 0 || maxTotalStakeQspWei > minStakeQspWei,
            "Max total stake cannot be less than min total stake.");
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
            0, // the initial total stake is 0,
            0, // the pool size is initially 0
            0, // total stakes in this pool
            poolName,
            maxTotalStakeQspWei
        );
        pools[currentPoolNumber] = p;
        bonusExpertAtPower[currentPoolNumber].push(1);
        powersOf100[currentPoolNumber].push(1);
        emit StateChanged(currentPoolNumber, PoolState.Initialized);
        currentPoolNumber = currentPoolNumber.add(1);
        // the following is expected to be initialized to poolId + 1
        poolNameToPoolIndex[poolName] = currentPoolNumber;
        balanceQspWei = balanceQspWei.add(depositQspWei);
    }

    /** Finds the pool index if a pool with the given name exists
    * @param poolName - an alphanumeric string indicating a pool name
    * @return - the index of the pool if a pool with that name exists, otherwise the max value of uint
    */
    function getPoolIndex(string poolName) public view returns(uint) {
        if (poolNameToPoolIndex[poolName] > 0) {
            return poolNameToPoolIndex[poolName].sub(1);
        } else {
            return MAX_UINT;
        }
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

    function getPoolSizeQspWei(uint index) public view returns(uint) {
        return pools[index].poolSizeQspWei;
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

    function getPoolStakeCount(uint index) public view returns(uint) {
        return pools[index].stakeCount;
    }

    function getPoolName(uint index) public view returns(string) {
        return pools[index].poolName;
    }

    function getPoolMaxTotalStakeQspWei(uint index) public view returns(uint) {
        return pools[index].maxTotalStakeQspWei;
    }

    /** Returns the list of staker addresses that placed stakes in this pool in chronological order
     * along with a list of booleans indicating if the corresponding staker in the address list is an expert or not.  
     * @param index - the pool index for which the list of stakers is required
     * @return - a pair of staker addresses and staker expert flags. 
     */
    function getPoolStakersList(uint index) public view returns(address[], bool[]) {
        return (poolToStakers[index], poolToStakersExpertStatus[index]);
    }

    /** Returns all the parameters of the pool.
     * @param index - the pool index for which the list of stakers is required
     * @return - a 3-tuple containing the following entries:
     *   0. a list of addresses containing the following entries:
     *        0. the address of the contract that must be protected
     *        1. the address of the policy that must be respected by the candidate contract
     *        2. the address of the owner of the pool (the stakeholder), not the owner of the contract
     *        3. the address of the first expert to stake in this pool
     *   1. a list of natural numbers containing the folowing entries:
     *        0. maxPayoutQspWei - the maximum payout that will be awarded to all stakers per payout period
     *        1. minStakeQspWei - the minimum value that needs to be raised from all stakers together
     *        2. maxTotalStakeQspWei - the maximum amount that can be staked in this pool
     *        3. bonusExpertFactor - the factor by which the payout of an expert is multiplied
     *        4. bonusFirstExpertFactor - the factor by which the payout of the first expert is multiplied
     *        5. payPeriodInBlocks - the number of blocks after which stakers are payed incentives, in case of no breach
     *        6. minStakeTimeInBlocks - the minimum number of blocks that funds need to be staked for
     *        7. timeoutInBlocks - the number of blocks after which a pool is canceled if there are not enough stakes
     *        8. depositQspWei - the current value deposited by the owner/stakeholder
     *        9. timeOfStateQspWei - the block number when the pool was set in its current state
     *        10. totalStakeQspWei - total amount of stake contributed so far
     *        11. poolSizeQspWei - the size of all stakes in this pool together with the bonuses awarded for experts
     *        12. stakeCount - the total number of stakes in the pool
     *        13. state - the current state of the pool
     *   2. the URL to the audit report (could also be a white-glove audit) of the pool
     *   3. the alphanumeric string indicating the name of the pool, defined by the pool owner
     */
    function getPoolParams(uint index) public view returns(address[], uint[], string, string) {
        address[] memory addresses = new address[](4);
        addresses[0] = pools[index].candidateContract;
        addresses[1] = pools[index].contractPolicy;
        addresses[2] = pools[index].owner;
        addresses[3] = pools[index].firstExpertStaker;
        uint[] memory numbers = new uint[](14);
        numbers[0] = pools[index].maxPayoutQspWei;
        numbers[1] = pools[index].minStakeQspWei;
        numbers[2] = pools[index].maxTotalStakeQspWei;
        numbers[3] = pools[index].bonusExpertFactor;
        numbers[4] = pools[index].bonusFirstExpertFactor;
        numbers[5] = pools[index].payPeriodInBlocks;
        numbers[6] = pools[index].minStakeTimeInBlocks;
        numbers[7] = pools[index].timeoutInBlocks;
        numbers[8] = pools[index].depositQspWei;
        numbers[9] = pools[index].timeOfStateInBlocks;
        numbers[10] = pools[index].totalStakeQspWei;
        numbers[11] = pools[index].poolSizeQspWei;
        numbers[12] = pools[index].stakeCount;
        numbers[13] = uint(pools[index].state);
        return (addresses, numbers, pools[index].urlOfAuditReport, pools[index].poolName);
    }

    /** Returns true if and only if the contract policy for the pool poolIndex is violated
    * @param poolIndex - index of the pool where the policy is checked
    */
    function isViolated(uint poolIndex) internal view returns (bool) {
        address poolPolicy = getPoolContractPolicy(poolIndex);
        address candidateContract = getPoolCandidateContract(poolIndex);
        return IPolicy(poolPolicy).isViolated(candidateContract);
    }

    /** This function returns the number of payouts that a staker must receive for his/her stake in a pool.
    * @param poolIndex - the index of the pool where the stake was placed
    * @param i - the index of the stake in the stakes array
    * @param staker - the address of the staker which has placed the stake
    * @param startBlockNumber - the block number where the stake begins to be active (waiting for payouts)
    * @return - the number of payout periods that the staker needs to receive payouts for
    */
    function getNumberOfPayoutsForStaker(
        uint poolIndex,
        uint i,
        address staker,
        uint startBlockNumber
    ) internal view returns(uint) {
        // compute the total number of pay periods for this pool and this staker
        uint currentPayPeriods = block.number.sub(startBlockNumber).div(getPoolPayPeriodInBlocks(poolIndex));
        // compute the last period this staker asked for a payout
        uint lastPayPeriods;
        if (startBlockNumber >= stakes[poolIndex][staker][i].lastPayoutBlock) {
            // then avoid integer underflow
            lastPayPeriods = 0;
        } else {
            lastPayPeriods = stakes[poolIndex][staker][i].lastPayoutBlock
                    .sub(startBlockNumber)
                    .div(getPoolPayPeriodInBlocks(poolIndex));
        }
        return currentPayPeriods.sub(lastPayPeriods);
    }

    /** Sets the state of the pool to a given state, while also marking the block at
    * which this occured and emitting an event corresponding to the new state.
    * @param poolIndex - the index of the pool for which the state is changed
    * @param newState - the new state to which the pool will change
    */
    function setState(uint poolIndex, PoolState newState) internal {
        PoolState poolState = getPoolState(poolIndex);
        if (poolState != newState) {
            pools[poolIndex].state = newState; // set the state
            /* Don't update the time of the stake if the policy expired because payouts still need to be awarded
               accoring to the time of the NonViolatedFunded state */
            if (newState != PoolState.PolicyExpired) {
                pools[poolIndex].timeOfStateInBlocks = block.number; // set the time when the state changed
            }
            emit StateChanged(poolIndex, newState); // emit an event that the state has changed
        }
    }

    /** Checks if the policy has expired and sets the state accordingly
     * @param poolIndex - the index of the pool for which the state is updated
     * @return the current state of the pool
     */
    function updatePoolState(uint poolIndex) internal returns(PoolState) {
        PoolState state = getPoolState(poolIndex);
        if (state == PoolState.NotViolatedFunded &&
            block.number >= getPoolMinStakeTimeInBlocks(poolIndex).add(getPoolTimeOfStateInBlocks(poolIndex))) {
            setState(poolIndex, PoolState.PolicyExpired);
            state = PoolState.PolicyExpired;
        }
        return state;
    }

    /** Updates state after calling funtion withdrawStake
    * @param poolIndex - the index of the pool from which the stake is withdrawn
    */
    function updateStateWithdrawStake(uint poolIndex) internal {
        PoolState state = getPoolState(poolIndex);
        uint timeoutBlock = getPoolTimeoutInBlocks(poolIndex).add(getPoolTimeOfStateInBlocks(poolIndex));
        if (state == PoolState.Initialized) {
            if (isViolated(poolIndex) || block.number >= timeoutBlock) {
                setState(poolIndex, PoolState.Cancelled);
            }
        } else if (state == PoolState.NotViolatedFunded) {
            // todo(mderka): this may not capture all the states changes and require checking
            // the function call has no effect outside this state
            updatePoolState(poolIndex);
        } else if (state != PoolState.PolicyExpired) {
            if (getPoolMinStakeQspWei(poolIndex) > getPoolTotalStakeQspWei(poolIndex)) {
                // todo(mderka): this may not capture all the states changes and require checking
                setState(poolIndex, PoolState.Cancelled);
            }
        }
    }

    /** Checks if the entire stake can be placed in a pool
     * @param poolIndex - the index of the pool for which the stake is submitted
     * @param amountQspWei - the stake size
     * @return the current state of the pool
     */
    function updateStakeAmount(uint poolIndex, uint amountQspWei) internal view returns(uint) {
        uint adjustedAmountQspWei = amountQspWei;
        if (pools[poolIndex].maxTotalStakeQspWei != 0) {
            require(pools[poolIndex].totalStakeQspWei < pools[poolIndex].maxTotalStakeQspWei);
            if (pools[poolIndex].totalStakeQspWei.add(amountQspWei) > pools[poolIndex].maxTotalStakeQspWei) {
                adjustedAmountQspWei = pools[poolIndex].maxTotalStakeQspWei.sub(pools[poolIndex].totalStakeQspWei);
            }
        }
        return adjustedAmountQspWei;
    }
}
