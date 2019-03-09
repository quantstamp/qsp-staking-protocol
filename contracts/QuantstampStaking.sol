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
import "./QuantstampStakingData.sol";


contract QuantstampStaking is Ownable {
    using SafeMath for uint256;
    using Math for uint256;

    uint constant internal MAX_UINT = ~uint(0);

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
    event StateChanged(uint poolIndex, QuantstampStakingData.PoolState state);

    // Signals that the payout block was updated
    event LastPayoutBlockUpdate(uint poolIndex, uint stakeIndex, address staker);

    // Indicates registry update
    event RegistryUpdated(address newRegistry);
    
    QuantstampStakingData internal data;

    /** Allows execution only when the policy of the pool is not violated.
    * @param poolIndex - index of the pool where the policy is checked
    */
    modifier whenNotViolated(uint poolIndex) {
        address poolPolicy = data.getPoolContractPolicy(poolIndex);
        address candidateContract = data.getPoolCandidateContract(poolIndex);
        
        require(!IPolicy(poolPolicy).isViolated(candidateContract) &&
            data.getPoolState(poolIndex) != QuantstampStakingData.PoolState.ViolatedFunded &&
            data.getPoolState(poolIndex) != QuantstampStakingData.PoolState.ViolatedUnderfunded,
            "Contract policy is violated.");
        _;
    }

    /** Allows execution only when the pool owner is the msg.sender.
    * @param poolIndex - index of the pool
    */
    modifier onlyPoolOwner(uint poolIndex) {
        address poolOwner = data.getPoolOwner(poolIndex);
        require(poolOwner == msg.sender, "Msg.sender is not pool owner.");
        _;
    }

    /** Initializes the Quality Assurance Protocol
    * @param tokenAddress - the address of the QSP Token contract
    * @param tcrAddress - the address of the security expert token curated registry
    * @param dataContractAddress - the address of the data contract for the current logic contract
    */
    constructor(address tokenAddress, address tcrAddress, address dataContractAddress) public {
        require(tokenAddress != address(0), "Token address is 0.");
        token = ERC20(tokenAddress);
        require(tcrAddress != address(0), "TCR address is 0.");
        stakingRegistry = IRegistry(tcrAddress);
        require(dataContractAddress != address(0), "Data contract address is 0.");
        data = QuantstampStakingData(dataContractAddress);
    }

    /** Allows the stakeholder to make an additional deposit to the contract
    * @param poolIndex - the index of the pool into which funds needs to be deposited
    * @param depositQspWei - the amount to be deposited into de pool
    */
    function depositFunds(
        uint poolIndex,
        uint depositQspWei
    ) external onlyPoolOwner(poolIndex) whenNotViolated(poolIndex) {
        address poolOwner = data.getPoolOwner(poolIndex);
        QuantstampStakingData.PoolState state = updatePoolState(poolIndex);
        require(state == QuantstampStakingData.PoolState.Initialized ||
            state == QuantstampStakingData.PoolState.NotViolatedUnderfunded ||
            state == QuantstampStakingData.PoolState.NotViolatedFunded ||
            state == QuantstampStakingData.PoolState.PolicyExpired);
        safeTransferToDataContract(poolOwner, depositQspWei);
        data.setDepositQspWei(poolIndex, data.getDepositQspWei(poolIndex).add(depositQspWei));
        data.setBalanceQspWei(data.getBalanceQspWei().add(depositQspWei));

        if (state == QuantstampStakingData.PoolState.NotViolatedUnderfunded
                && data.getDepositQspWei(poolIndex) >= data.getPoolMaxPayoutQspWei(poolIndex)) {
            setState(poolIndex, QuantstampStakingData.PoolState.NotViolatedFunded);
        }

        emit DepositMade(poolIndex, poolOwner, depositQspWei);
    }

    /** Allows the stakeholder to withdraw their entire deposits from the contract
    * if the policy is not violated
    * @param poolIndex - the index of the pool from which the deposit should be withdrawn
    */
    function withdrawDeposit(uint poolIndex) external onlyPoolOwner(poolIndex) {
        QuantstampStakingData.PoolState state = updatePoolState(poolIndex);
        /* If the policy is expired do not let the stakeholder withdraw his deposit until all stakers are payed out or
        * if the minimum time for staking has passed twice since the pool transitioned into the NotViolated funded state
        */
        if (state == QuantstampStakingData.PoolState.PolicyExpired && data.getPoolTotalStakeQspWei(poolIndex) > 0 &&
            data.getPoolTimeOfStateInBlocks(poolIndex).add(
                data.getPoolMinStakeTimeInBlocks(poolIndex).mul(2)) > block.number) {
            return;
        }
        address poolOwner = data.getPoolOwner(poolIndex);
        require(state == QuantstampStakingData.PoolState.Initialized || // always allow to withdraw in these states
            state == QuantstampStakingData.PoolState.NotViolatedUnderfunded ||
            state == QuantstampStakingData.PoolState.PolicyExpired ||
            state == QuantstampStakingData.PoolState.NotViolatedFunded ||
            state == QuantstampStakingData.PoolState.Cancelled,
            "Pool is not in the right state when withdrawing deposit.");
        uint withdrawalAmountQspWei = data.getPoolDepositQspWei(poolIndex);
        require(withdrawalAmountQspWei > 0, "The stakeholder has no balance to withdraw");
        data.setPoolDepositQspWei(poolIndex, 0);
        data.setBalanceQspWei(data.getBalanceQspWei().sub(withdrawalAmountQspWei));
        safeTransferFromDataContract(poolOwner, withdrawalAmountQspWei);
        setState(poolIndex, QuantstampStakingData.PoolState.Cancelled);
        emit DepositWithdrawn(poolIndex, poolOwner, withdrawalAmountQspWei);
    }

    /** Allows the staker to withdraw all their stakes from the pool.
    * @param poolIndex - the index of the pool from which the stake is withdrawn
    */
    function withdrawStake(uint poolIndex) external {
        QuantstampStakingData.PoolState state = updatePoolState(poolIndex);
        require(state == QuantstampStakingData.PoolState.Initialized ||
            state == QuantstampStakingData.PoolState.NotViolatedUnderfunded ||
            state == QuantstampStakingData.PoolState.Cancelled ||
            state == QuantstampStakingData.PoolState.PolicyExpired,
            "Pool is not in the right state when withdrawing stake.");

        uint totalQspWeiTransfer = data.getTotalStakes(poolIndex, msg.sender);

        if (totalQspWeiTransfer > 0) { // transfer the stake back
            uint stakeCount = data.getStakeCount(poolIndex, msg.sender);
            uint totalSizeChangeQspWei = 0;
            for (uint i = 0; i < stakeCount; i++) {
                totalSizeChangeQspWei = totalSizeChangeQspWei.add(
                    calculateStakeAmountWithBonuses(poolIndex, msg.sender, i));
            }
            data.removeStake(poolIndex, msg.sender);
            data.setPoolSizeQspWei(poolIndex, data.getPoolSizeQspWei(poolIndex).sub(totalSizeChangeQspWei));

            // actual transfer
            safeTransferFromDataContract(msg.sender, totalQspWeiTransfer);
            emit StakeWithdrawn(poolIndex, msg.sender, totalQspWeiTransfer);
            // update the pool state if necessary
            if (state != QuantstampStakingData.PoolState.PolicyExpired &&
                data.getPoolMinStakeQspWei(poolIndex) > data.getPoolTotalStakeQspWei(poolIndex)) {
                setState(poolIndex, QuantstampStakingData.PoolState.Cancelled);
            }
        }
    }

    /** In case the pool is not violated and the payPeriod duration has passed, it computes the payout of the staker
    * (defined by msg.sender),
    * and if the payout value is positive it transfers the corresponding amout from the pool to the staker.
    * @param poolIndex - the index of the pool from which the staker wants to receive a payout
    */
    function withdrawInterest(uint poolIndex) external {
        QuantstampStakingData.PoolState state = getPoolState(poolIndex);
        // State check
        require(state == QuantstampStakingData.PoolState.NotViolatedUnderfunded ||
            state == QuantstampStakingData.PoolState.ViolatedUnderfunded ||
            state == QuantstampStakingData.PoolState.NotViolatedFunded ||
            state == QuantstampStakingData.PoolState.PolicyExpired,
            "The state of the pool is not as expected.");
        // Check if policy is expired and if not check if the policy is violated
        if (state != QuantstampStakingData.PoolState.PolicyExpired && block.number >=
            data.getPoolMinStakeTimeInBlocks(poolIndex).add(data.getPoolTimeOfStateInBlocks(poolIndex))) {
            setState(poolIndex, QuantstampStakingData.PoolState.PolicyExpired);
        } else if (state == QuantstampStakingData.PoolState.PolicyExpired && (block.number >=
            data.getPoolMinStakeTimeInBlocks(poolIndex).mul(2).add(data.getPoolTimeOfStateInBlocks(poolIndex)) ||
            data.getPoolTotalStakeQspWei(poolIndex) == 0)) {
            setState(poolIndex, QuantstampStakingData.PoolState.Cancelled);
        }
        bool violated = state != QuantstampStakingData.PoolState.ViolatedUnderfunded && isViolated(poolIndex);
        if (violated && state == QuantstampStakingData.PoolState.NotViolatedUnderfunded) {
            setState(poolIndex, QuantstampStakingData.PoolState.ViolatedUnderfunded);
        } else if (violated && state == QuantstampStakingData.PoolState.NotViolatedFunded) {
            setState(poolIndex, QuantstampStakingData.PoolState.ViolatedFunded);
            return; // no interest is payed in the ViolatedFunded state
        }
        uint payout = computePayout(poolIndex, msg.sender);
        // Check that enough time (blocks) has passed since the pool has collected stakes totaling
        // at least minStakeQspWei
        if (block.number < data.getPoolPayPeriodInBlocks(poolIndex).add(data.getPoolTimeOfStateInBlocks(poolIndex)) ||
            payout == 0) { // no need to transfer anything
            return;
        } else if (data.getPoolDepositQspWei(poolIndex) < payout) { // place the pool in a Cancelled state
            setState(poolIndex, QuantstampStakingData.PoolState.Cancelled);
            return;
        }
        // Otherwise there are enough funds, so transfer the funds
        data.setDepositQspWei(poolIndex, data.getDepositQspWei(poolIndex).sub(payout));
        data.setBalanceQspWei(data.getBalanceQspWei().sub(payout));
        updateAllStakes(poolIndex, msg.sender);
        safeTransferFromDataContract(msg.sender, payout);
        emit StakerReceivedPayout(poolIndex, msg.sender, payout);
    }

    /** Checks if the given address is a staker of the given pool index
    * @param poolIndex - the index of the pool where to check for stakers
    * @param staker - the address of the staker to check for
    * @return - true if the staker has a stake in the pool, false otherwise
    */
    function isStaker(uint poolIndex, address staker) external view returns(bool) {
        return data.isStaker(poolIndex, staker);
    }

    /** Gives all the staked funds to the stakeholder provided that the policy was violated and the
    * state of the contract allows.
    * @param poolIndex - the index of the pool where the claim will be withdrawn
    */
    function withdrawClaim(uint poolIndex) public onlyPoolOwner(poolIndex) {
        QuantstampStakingData.PoolState state = updatePoolState(poolIndex);
        // allowed IFF the pool is in the not violated state (yet) but the policy has been violated
        // or the pool is in ViolatedFunded state already
        require(
            (state == QuantstampStakingData.PoolState.ViolatedFunded) ||
            (state == QuantstampStakingData.PoolState.NotViolatedFunded && isViolated(poolIndex))
        );

        // claim all stakes
        uint total = data.getPoolDepositQspWei(poolIndex).add(data.getPoolTotalStakeQspWei(poolIndex));
        data.setBalanceQspWei(data.getBalanceQspWei().sub(total));
        
        data.setPoolDepositQspWei(poolIndex, 0);
        data.setPoolTotalStakeQspWei(poolIndex, 0);
        data.setPoolSizeQspWei(poolIndex, 0);

        setState(poolIndex, QuantstampStakingData.PoolState.ViolatedFunded);
        safeTransferFromDataContract(data.getPoolOwner(poolIndex), total);
        emit ClaimWithdrawn(poolIndex, total);
    }

    /** Transfers an amount of QSP from the staker to the pool
    * @param poolIndex - the index of the pool where the funds are transferred to
    * @param amountQspWei - the amount of QSP Wei that is transferred
    */
    function stakeFunds(uint poolIndex, uint amountQspWei) public whenNotViolated(poolIndex) {
        QuantstampStakingData.PoolState state = updatePoolState(poolIndex);
        require((state == QuantstampStakingData.PoolState.Initialized) ||
            (state == QuantstampStakingData.PoolState.NotViolatedUnderfunded) ||
            (state == QuantstampStakingData.PoolState.NotViolatedFunded), 
                "Pool is not in the right state when staking funds.");
        // Check if pool can be switched from the initialized state to another state
        if ((state == QuantstampStakingData.PoolState.Initialized) &&
            // then timeout has occured and stakes are not allowed
            (data.getPoolTimeoutInBlocks(poolIndex) <= block.number.sub(data.getPoolTimeOfStateInBlocks(poolIndex)))) {
            setState(poolIndex, QuantstampStakingData.PoolState.Cancelled);
            return;
        }
        uint adjustedAmountQspWei = updateStakeAmount(poolIndex, amountQspWei);
        // If policy is not violated then transfer the stake
        safeTransferToDataContract(msg.sender, adjustedAmountQspWei);

        uint stakeIndex = data.createStake(poolIndex, msg.sender,
            adjustedAmountQspWei, block.number, block.number, isExpert(msg.sender));

        data.setPoolSizeQspWei(poolIndex, data.getPoolSizeQspWei(poolIndex).add(
            calculateStakeAmountWithBonuses(poolIndex, msg.sender, stakeIndex)));
            
        // Check if there are enough stakes in the pool
        if (data.getPoolTotalStakeQspWei(poolIndex) >= data.getPoolMinStakeQspWei(poolIndex)) {
            // Minimum staking value was reached
            if (data.getPoolDepositQspWei(poolIndex) >= data.getPoolMaxPayoutQspWei(poolIndex)) {
                // The pool is funded by enough to pay stakers
                setState(poolIndex, QuantstampStakingData.PoolState.NotViolatedFunded);
            } else {
                // The pool is does not have enough funds to pay stakers
                setState(poolIndex, QuantstampStakingData.PoolState.NotViolatedUnderfunded);
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
        uint poolIndex, address staker, uint stakeIndex) public view returns(uint) 
    {
        uint stakeAmount;
        bool expertStake;
        uint contributionIndex;
        (stakeAmount, , , contributionIndex, expertStake) = data.getStake(
            poolIndex, staker, stakeIndex);

        if (stakeAmount == 0) {
            return 0;
        }
        // check if the staker is an expert
        if (expertStake) {
            stakeAmount = stakeAmount.mul(data.getBonusExpertAtPower(poolIndex, contributionIndex).
                add(data.getPowersOf100(poolIndex, contributionIndex))).
                div(data.getPowersOf100(poolIndex, contributionIndex));

            /* Check if it is the first stake of the first expert */
            if (data.getPoolFirstExpertStaker(poolIndex) == staker && stakeIndex == 0) {
                stakeAmount = stakeAmount.mul(data.getPoolBonusFirstExpertFactor(poolIndex).add(100)).div(100);
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

        if (data.getTotalStakes(poolIndex, staker) == 0) { // no stakes have been placed by this staker yet
            return 0;
        }

        if (data.getPoolSizeQspWei(poolIndex) == 0) { // all stakes have been withdrawn
            return 0;
        }
        
        uint stakeCount = data.getStakeCount(poolIndex, staker);

        // compute the numerator by adding the staker's stakes together
        for (uint i = 0; i < stakeCount; i++) {
            uint stakeAmount = calculateStakeAmountWithBonuses(poolIndex, staker, i);
            uint blockPlaced = data.getStakeBlockPlaced(poolIndex, staker, i);
            // get the maximum between when the pool because NotViolatedFunded and the staker placed his stake
            uint startBlockNumber = Math.max(blockPlaced,
                data.getPoolTimeOfStateInBlocks(poolIndex));
            // multiply the stakeAmount by the number of payPeriods for which the stake has been active and not payed
            stakeAmount = stakeAmount.mul(getNumberOfPayoutsForStaker(poolIndex, i, staker, startBlockNumber));
            numerator = numerator.add(stakeAmount);
        }

        return numerator.mul(data.getPoolMaxPayoutQspWei(poolIndex)).div(data.getPoolSizeQspWei(poolIndex));
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

        QuantstampStakingData.PoolState state = data.getPoolState(poolIndex);
        if (state == QuantstampStakingData.PoolState.Initialized) {
            setState(poolIndex, QuantstampStakingData.PoolState.Cancelled);
        } else if (state == QuantstampStakingData.PoolState.NotViolatedUnderfunded) {
            setState(poolIndex, QuantstampStakingData.PoolState.ViolatedUnderfunded);
        } else if (state == QuantstampStakingData.PoolState.NotViolatedFunded) {
            setState(poolIndex, QuantstampStakingData.PoolState.ViolatedFunded);
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
        safeTransferToDataContract(msg.sender, depositQspWei);
        require(maxPayoutQspWei > 0, "Maximum payout cannot be zero.");
        require(minStakeQspWei > 0, "Minimum stake cannot be zero.");
        require(payPeriodInBlocks > 0, "Pay period cannot be zero.");
        require(minStakeTimeInBlocks > 0, "Minimum staking period cannot be zero.");
        require(timeoutInBlocks > 0, "Timeout period cannot be zero.");
        require(maxTotalStakeQspWei == 0 || maxTotalStakeQspWei > minStakeQspWei,
            "Max total stake cannot be less than min total stake.");
        uint[] memory intParams = new uint[](9);
        intParams[0] = maxPayoutQspWei;
        intParams[1] = minStakeQspWei;
        intParams[2] = depositQspWei;
        intParams[3] = bonusExpertFactor;
        intParams[4] = bonusFirstExpertFactor;
        intParams[5] = payPeriodInBlocks;
        intParams[6] = minStakeTimeInBlocks;
        intParams[7] = timeoutInBlocks;
        intParams[8] = maxTotalStakeQspWei;

        address[] memory addresses = new address[](3);
        addresses[0] = candidateContract;
        addresses[1] = contractPolicy;
        addresses[2] = msg.sender;

        emit StateChanged(data.createPool(
            addresses,
            intParams,
            urlOfAuditReport,
            poolName
        ), QuantstampStakingData.PoolState.Initialized);
    }

    /** Finds the pool index if a pool with the given name exists
    * @param poolName - an alphanumeric string indicating a pool name
    * @return - the index of the pool if a pool with that name exists, otherwise the max value of uint
    */
    function getPoolIndex(string poolName) public view returns(uint) {
        return data.getPoolIndex(poolName);
    }

    function getToken() public view returns (address) {
        return address(token);
    }

    function getStakingRegistry() public view returns (address) {
        return address(stakingRegistry);
    }

    function getPoolState(uint poolIndex) public view returns (
        QuantstampStakingData.PoolState
    ) {
        return data.getPoolState(poolIndex);
    }

    function getBalanceQspWei() public view returns (uint) {
        return data.getBalanceQspWei();
    }

    function getPoolContractPolicy(uint poolIndex) public view returns (address) {
        return data.getPoolContractPolicy(poolIndex);
    }

    function getPoolCandidateContract(uint poolIndex) public view returns (address) {
        return data.getPoolCandidateContract(poolIndex);
    }

    /** Returns true if and only if the contract policy for the pool poolIndex is violated
    * @param poolIndex - index of the pool where the policy is checked
    */
    function isViolated(uint poolIndex) internal view returns (bool) {
        address poolPolicy = data.getPoolContractPolicy(poolIndex);
        address candidateContract = data.getPoolCandidateContract(poolIndex);
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
        uint currentPayPeriods = block.number.sub(startBlockNumber).div(
            data.getPoolPayPeriodInBlocks(poolIndex));
        // compute the last period this staker asked for a payout

        uint lastPayPeriods;
        uint lastPayoutBlock = data.getStakeLastPayoutBlock(poolIndex, staker, i);

        if (startBlockNumber >= lastPayoutBlock) {
            // then avoid integer underflow
            lastPayPeriods = 0;
        } else {
            lastPayPeriods = lastPayoutBlock
                    .sub(startBlockNumber)
                    .div(data.getPoolPayPeriodInBlocks(poolIndex));
        }
        return currentPayPeriods.sub(lastPayPeriods);
    }

    /** Sets the state of the pool to a given state, while also marking the block at
    * which this occured and emitting an event corresponding to the new state.
    * @param poolIndex - the index of the pool for which the state is changed
    * @param newState - the new state to which the pool will change
    */
    function setState(uint poolIndex, QuantstampStakingData.PoolState newState) internal {
        QuantstampStakingData.PoolState poolState = data.getPoolState(poolIndex);
        if (poolState != newState) {
            data.setState(poolIndex, newState); // set the state
            /* Don't update the time of the stake if the policy expired because payouts still need to be awarded
               accoring to the time of the NonViolatedFunded state */
            if (newState != QuantstampStakingData.PoolState.PolicyExpired) {
                data.setPoolTimeOfStateInBlocks(poolIndex, block.number); // set the time when the state changed
            }

            if (newState == QuantstampStakingData.PoolState.NotViolatedFunded
                && data.getPoolMinStakeStartBlock(poolIndex) == 0) {
                data.setPoolMinStakeStartBlock(poolIndex, block.number);
            }

            emit StateChanged(poolIndex, newState); // emit an event that the state has changed
        }
    }

    /** Checks if the policy has expired and sets the state accordingly
     * @param poolIndex - the index of the pool for which the state is updated
     * @return the current state of the pool
     */
    function updatePoolState(uint poolIndex) internal returns(QuantstampStakingData.PoolState) {
        QuantstampStakingData.PoolState state = data.getPoolState(poolIndex);
        if (state == QuantstampStakingData.PoolState.NotViolatedFunded &&
            block.number >= data.getPoolMinStakeTimeInBlocks(poolIndex).add(
                data.getPoolTimeOfStateInBlocks(poolIndex))) {
            setState(poolIndex, QuantstampStakingData.PoolState.PolicyExpired);
            state = QuantstampStakingData.PoolState.PolicyExpired;
        }
        return state;
    }

    /** Checks if the entire stake can be placed in a pool
     * @param poolIndex - the index of the pool for which the stake is submitted
     * @param amountQspWei - the stake size
     * @return the current state of the pool
     */
    function updateStakeAmount(uint poolIndex, uint amountQspWei) internal view returns(uint) {
        uint adjustedAmountQspWei = amountQspWei;
        uint max = data.getPoolMaxTotalStakeQspWei(poolIndex);
        uint current = data.getPoolTotalStakeQspWei(poolIndex);
        if (max != 0) {
            require(current < max);
            if (current.add(amountQspWei) > max) {
                adjustedAmountQspWei = max.sub(current);
            }
        }
        return adjustedAmountQspWei;
    }
    
    /**
    * @dev Used to transfer funds stored in the data contract to a given address.
    * @param _to The address to transfer funds.
    * @param amountQspWei The amount of wei-QSP to be transferred.
    */
    function safeTransferFromDataContract(address _to, uint256 amountQspWei) internal {
        data.approveWhitelisted(amountQspWei);
        require(token.transferFrom(address(data), _to, amountQspWei),
            "Token transfer from data contract did not succeed");
    }

    /**
    * @dev Used to transfer funds from a given address to the data contract.
    * @param _from The address to transfer funds from.
    * @param amountQspWei The amount of wei-QSP to be transferred.
    */
    function safeTransferToDataContract(address _from, uint256 amountQspWei) internal {
        require(token.transferFrom(_from, address(data), amountQspWei),
            "Token transfer to data contract did not succeed");
    }

    /**
     * @dev Used to update the last payout block of every stake in a pool for a staker.
     * @param poolIndex The index of the pool where the stakes are updated.
     * @param sender The address of the staker whose stakes are updated.
     */
    function updateAllStakes(uint poolIndex, address sender) internal {
        uint stakeCount = data.getStakeCount(poolIndex, sender);
        for (uint i = 0; i < stakeCount; i++) {
            uint m = Math.max(
                data.getStakeBlockPlaced(poolIndex, sender, i),
                data.getPoolTimeOfStateInBlocks(poolIndex)
            );
            data.setStakeBlockPlaced(poolIndex, sender, i, m);

            uint numberOfPayouts = getNumberOfPayoutsForStaker(poolIndex, i, sender,
                data.getStakeBlockPlaced(poolIndex, sender, i));

            if (numberOfPayouts > 0) {
                data.setStakeLastPayoutBlock(poolIndex, sender, i, block.number);
                emit LastPayoutBlockUpdate(poolIndex, i, sender);
            }
        }
    }
}
