pragma solidity ^0.4.19;

/// @title QSPb - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "./LinkedListLib.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract QSPb is Ownable {
  using LinkedListLib for LinkedListLib.LinkedList;
  using SafeMath for uint256;

  enum PoolState { Initialized, // Pool was initialized, Insufficient stakes
	           NotViolatedSstkIdep, // Policy Not Violated, Sufficient stakes, Insufficient deposit
		   ViolatedSstkIdep, // Policy Violated, Sufficient stakes, Insufficient deposit
		   NotViolatedSstkSdep, // Policy Not Violated, Sufficient stakes, Sufficient deposit
		   ViolatedSstkSdep, // Policy Violated, Sufficient stakes, Sufficient deposit
		   TimedOut, // Pool has timed-out due to insufficient stakes
		   CanceledExpired } // Pool was canceled or policy has expired

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
    //mapping (address => uint) stakes;
    //LinkedListLib.LinkedList stakingOrder;
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

  function submitContract(address c, uint maxPayout, uint minStake, 
                      uint bonusExpert, uint bonusFirstExp, uint payPeriod, 
                      uint minStkTime, uint timeout) public payable {

    balance.add(msg.value);
    //LinkedListLib.LinkedList internal ll;

    Pool memory p = Pool(c, msg.sender, maxPayout, minStake, msg.value, bonusExpert, 
		  bonusFirstExp, payPeriod, minStkTime, timeout, now); 

    pools.push(p);
  }
}
