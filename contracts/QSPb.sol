pragma solidity ^0.4.19;

/// @title QSPb - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "./LinkedListLib.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract QSPb is Ownable {
  using LinkedListLib for LinkedListLib.LinkedList;
  
  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;
		
  uint public balance;  
	
  struct Pool {
    address owner;
    uint stakeholderDeposit;
    mapping (address => uint) stakes;
    LinkedListLib.LinkedList stakingOrder;
    uint timeOfInit;
  }

  function createPool(address c, uint maxPayout, uint minStake, uint iniDeposit, 
                      uint bonusExpert, uint bonusFirstExp, uint payPeriod, 
                      uint minStkTime, uint minStkPeriod, uint timeout) public {

  }

}
