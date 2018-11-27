pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title CandidateContract - an example contract that must be protected according to a policy

contract CandidateContract {

    using SafeMath for uint256;

    uint public balance;

    event Withdraw(uint amount);

    constructor(uint _balance) public {
        balance = _balance;
    }

    function withdraw(uint amount) public {
        balance = balance.sub(amount);
        emit Withdraw(amount);
    }
}
