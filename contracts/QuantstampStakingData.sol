pragma solidity 0.4.24;

/// @title QuantstampStakingData - is the smart contract storing persistent data of the Staking Protocol
/// @author Quantstamp

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";


contract QuantstampStakingData is Ownable {
    using SafeMath for uint256;
    using Math for uint256;

    uint constant internal MAX_UINT = ~uint(0);
    
    mapping(address => bool) public whitelist;

    modifier onlyWhitelisted() {
        require(whitelist[msg.sender] == true);
        _;
    }

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

    ERC20 public token;

    /** Initializes the Assurance Data Contract
    */
    constructor(address tokenAddress) public {
        currentPoolNumber = 0;
        balanceQspWei = 0;
        token = ERC20(tokenAddress);
    }

    /** Checks if the given address is a staker of the given pool index
    * @param poolIndex - the index of the pool where to check for stakers
    * @param staker - the address of the staker to check for
    * @return - true if the staker has a stake in the pool, false otherwise
    */
    function isStaker(uint poolIndex, address staker) external view returns(bool) {
        return (stakes[poolIndex][staker].length > 0) && (totalStakes[poolIndex][staker] > 0);
    }

    /** Creates a new stake in the data contract
    * @param poolIndex - the index of the pool where to stake
    * @param staker - the address of the staker
    * @param amountQspWei - the stake amount
    * @param blockPlaced - the block at which the stake is placed
    * @param lastPayoutBlock - initial value of lastPayoutBlock
    * @param isExpert - whether this stake is an expert's stake
    * @return - index of the stake in the user's stakes array
    */
    function createStake(
        uint poolIndex,
        address staker,
        uint amountQspWei,
        uint blockPlaced,
        uint lastPayoutBlock,
        bool isExpert
    ) public onlyWhitelisted returns (uint) {
        pools[poolIndex].stakeCount += 1;
        uint currentStakeIndex = pools[poolIndex].stakeCount;
        Stake memory stake = Stake(staker, amountQspWei, blockPlaced, lastPayoutBlock,
            currentStakeIndex, isExpert);
        stakes[poolIndex][staker].push(stake);

        if (stakes[poolIndex][staker].length == 1) { // then this is the first stake placed by this staker
            poolToStakers[poolIndex].push(staker);
            poolToStakersExpertStatus[poolIndex].push(isExpert);
            poolToStakerIndex[poolIndex][staker] = poolToStakers[poolIndex].length - 1;
        }
        totalStakes[poolIndex][staker] = totalStakes[poolIndex][staker].add(amountQspWei);

        balanceQspWei = balanceQspWei.add(amountQspWei);
        pools[poolIndex].totalStakeQspWei = pools[poolIndex].totalStakeQspWei.add(amountQspWei);
        // Set first expert if it is not set and the staker is an expert on the TCR
        if (getPoolFirstExpertStaker(poolIndex) == address(0) && isExpert) {
            pools[poolIndex].firstExpertStaker = staker;
        }
        // Update pool size
        bonusExpertAtPower[poolIndex].push(
            bonusExpertAtPower[poolIndex][currentStakeIndex - 1].mul(getPoolBonusExpertFactor(poolIndex)));
        powersOf100[poolIndex].push(powersOf100[poolIndex][currentStakeIndex - 1].mul(100));
        return stakes[poolIndex][staker].length - 1;
    }
    
    /** Removes the staker's stake
    * @param poolIndex - the index of the pool where the funds are transferred to
    * @param staker - the staker
    */
    function removeStake(
        uint poolIndex,
        address staker
    ) public onlyWhitelisted {
        uint totalQspWeiTransfer = totalStakes[poolIndex][staker];
      
        if (totalQspWeiTransfer > 0) { // transfer the stake back
            balanceQspWei = balanceQspWei.sub(totalQspWeiTransfer);
            totalStakes[poolIndex][staker] = 0;
            pools[poolIndex].totalStakeQspWei = pools[poolIndex].totalStakeQspWei.sub(totalQspWeiTransfer);
            // this loop is needed, because the computePayout function uses the stakes array
            for (uint i = 0; i < stakes[poolIndex][staker].length; i++) {
                stakes[poolIndex][staker][i].amountQspWei = 0;
            }
            // remove this staker from the list of stakers of this pool
            delete poolToStakers[poolIndex][poolToStakerIndex[poolIndex][staker]];
            delete poolToStakersExpertStatus[poolIndex][poolToStakerIndex[poolIndex][staker]];
        }
    }

    /** Creates a new staking pool.
    * @param addresses - address parameters
    * @param intParams - integer parameters
    * @param urlOfAuditReport - a URL to some audit report (could also be a white-glove audit)
    * @param poolName - an alphanumeric string defined by the pool owner
    */
    function createPool(
        address[] addresses,
        uint[] intParams,
        string urlOfAuditReport,
        string poolName
    ) public onlyWhitelisted returns (uint) {
        Pool memory p = Pool(
            addresses[0],
            addresses[1],
            addresses[2],
            intParams[0],
            intParams[1],
            intParams[2],
            intParams[3],
            intParams[4],
            address(0), // no expert staker
            intParams[5],
            intParams[6],
            intParams[7],
            block.number,
            urlOfAuditReport,
            PoolState.Initialized,
            0, // the initial total stake is 0,
            0, // the pool size is initially 0
            0, // total stakes in this pool
            poolName,
            intParams[8]
        );
        pools[currentPoolNumber] = p;
        bonusExpertAtPower[currentPoolNumber].push(1);
        powersOf100[currentPoolNumber].push(1);
        uint result = currentPoolNumber;
        currentPoolNumber = currentPoolNumber.add(1);
        // the following is expected to be initialized to poolId + 1
        poolNameToPoolIndex[poolName] = currentPoolNumber;
        balanceQspWei = balanceQspWei.add(intParams[2]);
        return result;
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
    
    function setPoolDepositQspWei(uint index, uint depositQspWei) public onlyWhitelisted {
        pools[index].depositQspWei = depositQspWei;
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
    
    function setPoolTimeOfStateInBlocks(uint index, uint timeOfStateInBlocks) public onlyWhitelisted {
        pools[index].timeOfStateInBlocks = timeOfStateInBlocks;
    }

    function getPoolSizeQspWei(uint index) public view returns(uint) {
        return pools[index].poolSizeQspWei;
    }
    
    function setPoolSizeQspWei(uint index, uint amountQspWei) public onlyWhitelisted {
        pools[index].poolSizeQspWei = amountQspWei;
    }

    function getPoolUrlOfAuditReport(uint index) public view returns(string) {
        return pools[index].urlOfAuditReport;
    }

    function getPoolState(uint index) public view returns(PoolState) {
        return pools[index].state;
    }

    function getPoolTotalStakeQspWei(uint index) public view returns(uint) {
        return pools[index].totalStakeQspWei;
    }
    
    function setPoolTotalStakeQspWei(uint index, uint amountQspWei) public onlyWhitelisted {
        pools[index].totalStakeQspWei = amountQspWei;
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

    /** Sets the state of the pool to a given state, while also marking the block at
    * which this occured and emitting an event corresponding to the new state.
    * @param poolIndex - the index of the pool for which the state is changed
    * @param newState - the new state to which the pool will change
    */
    function setState(uint poolIndex, PoolState newState) public onlyWhitelisted {
        pools[poolIndex].state = newState; // set the state
    }

    function getTotalStakes(uint poolIndex, address staker) public view returns (uint) {
        return totalStakes[poolIndex][staker]; 
    }

    function setTotalStakes(uint poolIndex, address staker, uint amountQspWei) public onlyWhitelisted {
        totalStakes[poolIndex][staker] = amountQspWei; 
    }

    function getStakeCount(uint poolIndex, address staker) public view returns (uint) {
        return stakes[poolIndex][staker].length;
    }

    function getStake(uint poolIndex, address staker, uint i) public view returns (
        uint amountQspWei, // the amount staked by the staker
        uint blockPlaced, // the Block number when this stake was made
        uint lastPayoutBlock, // the Block number where the last payout was made to this staker
        uint contributionIndex, // the absolute index of the stake in the pool (numbering starts with 1)
        bool expertStake // true iff the staker was on the TCR when the stake was placed
    ) {
        Stake memory stake = stakes[poolIndex][staker][i];
        return (stake.amountQspWei, stake.blockPlaced,
            stake.lastPayoutBlock, stake.contributionIndex, stake.expertStake);
    }

    function setDepositQspWei(uint poolIndex, uint depositQspWei) public onlyWhitelisted {
        pools[poolIndex].depositQspWei = depositQspWei;
    }
    
    function getDepositQspWei(uint poolIndex) public view returns (uint) {
        return pools[poolIndex].depositQspWei;
    }
    
    function setBalanceQspWei(uint newBalanceQspWei) public onlyWhitelisted {
        balanceQspWei = newBalanceQspWei;
    }
    
    function getBalanceQspWei() public view returns (uint) {
        return balanceQspWei;
    }
    
    function getStakeBlockPlaced(uint poolIndex, address staker,
        uint stakeIndex) public view returns (uint) {
        return stakes[poolIndex][staker][stakeIndex].blockPlaced;
    }
    
    function setStakeBlockPlaced(uint poolIndex, address staker, uint stakeIndex,
        uint blockNumber) public onlyWhitelisted {
        stakes[poolIndex][staker][stakeIndex].blockPlaced = blockNumber;
    }
    
    function setStakeLastPayoutBlock(uint poolIndex, address staker, uint stakeIndex,
        uint blockNumber) public onlyWhitelisted {
        stakes[poolIndex][staker][stakeIndex].lastPayoutBlock = blockNumber;
    }
    
    function getStakeLastPayoutBlock(uint poolIndex, address staker,
        uint stakeIndex) public view returns(uint) {
        return stakes[poolIndex][staker][stakeIndex].lastPayoutBlock;
    }
    
    function getPowersOf100(uint poolIndex, uint powerIndex) public view returns (uint) {
        return powersOf100[poolIndex][powerIndex];
    }

    function getBonusExpertAtPower(uint poolIndex, uint powerIndex) public view returns (uint) {
        return bonusExpertAtPower[poolIndex][powerIndex];
    }

    function approveWhitelisted(uint256 amountQspWei) public onlyWhitelisted {
        token.approve(msg.sender, amountQspWei);
    }

    function addWhitelistAddress(address _address) public onlyOwner {
        whitelist[_address] = true;
    }

    function removeWhitelistAddress(address _address) public onlyOwner {
        whitelist[_address] = false;
    }
}
