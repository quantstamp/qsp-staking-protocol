pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title CandidateContract - an example contract that must be protected according to a policy

contract CandidateContract {

    using SafeMath for uint256;

    // state of the contract's lifecycle
    enum ContractState {
        Unlocked,
        Locked
    }

    uint public balance;
    ContractState public state;

    event Withdraw(uint amount);

    constructor(uint _balance) public {
        balance = _balance;
        state = ContractState.Unlocked;
    }

    function withdraw(uint amount) public {
        require(state == ContractState.Unlocked);
        balance = balance.sub(amount);
        emit Withdraw(amount);
    }

    // Real contracts wouldn't have such a public function.
    function lockContract() public {
      state = ContractState.Locked;
    }

}
