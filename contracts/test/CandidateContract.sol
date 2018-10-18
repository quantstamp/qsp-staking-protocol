pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract CandidateContract {
    
    using SafeMath for uint256;

    uint public balance;

    constructor(uint _balance) public {
        balance = _balance;
    }

    function withdraw(uint amount) public view {
        balance.sub(amount);
    }
}