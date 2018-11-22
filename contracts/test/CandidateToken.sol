pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol";

contract CandidateToken is MintableToken {
    string public constant name = "CandidateToken";
    string public constant symbol = "CAN";
    uint8 public constant decimals = 18;
}
