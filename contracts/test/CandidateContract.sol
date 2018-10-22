pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title CandidateContract - an example contract that must be protected according to a policy
/// @author Sebastian Banescu

contract CandidateContract {
    
    using SafeMath for uint256;

    uint public balance;

    constructor(uint _balance) public {
        balance = _balance;
    }

    function withdraw(uint amount) public {
        balance = balance.sub(amount);
    }
}
