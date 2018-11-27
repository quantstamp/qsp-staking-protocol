pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract CandidateToken is ERC20Mintable, Ownable {
    string public constant name = "CandidateToken";
    string public constant symbol = "CAN";
    uint8 public constant decimals = 18;
}
