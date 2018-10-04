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
        address c;
	address contractPolicy;
        address owner;
        uint maxPayout;
        uint minStake;
        uint deposit;
        uint bonusExpert;
        uint bonusFirstExpert;
        uint payPeriod;
        uint minSktTime;
        uint timeout;
        uint timeOfInit;
    }

    // store sha3(Pool) as the key of the mapping
    mapping (bytes32 => Stake[]) stakes; 

    // constants used by LinkedListLib
    uint256 constant internal NULL = 0;
    uint256 constant internal HEAD = 0;
    bool constant internal PREV = false;
    bool constant internal NEXT = true;

    uint public balance;  
    Pool[] public pools;
  
    constructor() public {
        balance = 0;
    }

    function getPoolsLength() public view returns (uint) {
        return pools.length;
    }

    function createPool(address c, address contractPolicy, uint maxPayout, uint minStake,
                      uint bonusExpert, uint bonusFirstExp, uint payPeriod,
                      uint minStkTime, uint timeout) public payable {

        Pool memory p = Pool(c, contractPolicy, msg.sender, maxPayout, minStake, msg.value, 
			     bonusExpert, bonusFirstExp, payPeriod, minStkTime, timeout, now);
        pools.push(p);
    }

    function stakeFunds(bytes32 poolHash) public payable {
        stakes[poolHash].push(Stake(msg.sender, msg.value)); 
    }
}
