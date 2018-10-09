pragma solidity 0.4.24;

/// @title QSPb - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "./LinkedListLib.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract QSPb is Ownable {
    using LinkedListLib for LinkedListLib.LinkedList;
    using SafeMath for uint256;
 
    // constants used by LinkedListLib
    uint256 constant internal NULL = 0;
    uint256 constant internal HEAD = 0;
    bool constant internal PREV = false;
    bool constant internal NEXT = true;

    uint public balance;

    address public tcr;  
  
    constructor(address tcrAddress) public {
        balance = 0;
        tcr = tcrAddress;
    }

    function isExpert(address addr) public view returns(bool) {
        return tcr.isWhitelisted(addr);
    }
}
