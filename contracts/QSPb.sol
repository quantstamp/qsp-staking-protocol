pragma solidity 0.4.24;

/// @title QSPb - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "./LinkedListLib.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract QSPb is Ownable {
    using LinkedListLib for LinkedListLib.LinkedList;
    using SafeMath for uint256;
 
    struct Pool {
        address c;
        address owner;
        uint maxPayout;
        uint minStake;
        uint deposit;
        uint bonusExpert;
        uint bonusFirstExpert;
        uint payPeriod;
        uint minSktTime;
        uint timeout;
        mapping (address => uint) stakes;
        LinkedListLib.LinkedList stakingOrder;
        uint timeOfInit;
    }

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

    function createPool(address c, uint maxPayout, uint minStake,
                      uint bonusExpert, uint bonusFirstExp, uint payPeriod,
                      uint minStkTime, uint timeout) public payable {

        balance.add(msg.value);
        mapping (address => uint) public stakes;
	LinkedListLib.LinkedList public stakingOrder;

        Pool memory p = Pool(c, msg.sender, maxPayout, minStake, msg.value, bonusExpert,
			     bonusFirstExp, payPeriod, minStkTime, timeout, stakes, staking Order, now);
        pools.push(p);
    }
}
