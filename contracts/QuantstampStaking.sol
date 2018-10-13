pragma solidity 0.4.24;

/// @title QuantstampStaking - is the smart contract representing the core of the Staking Protocol
/// @author Sebastian Banescu

import "./LinkedListLib.sol";
import "./tcr/Registry.sol"; //Imports SafeMath
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract QuantstampStaking is Ownable {
    using LinkedListLib for LinkedListLib.LinkedList;
    using SafeMath for uint256;

    // constants used by LinkedListLib
    uint256 constant internal NULL = 0;
    uint256 constant internal HEAD = 0;
    bool constant internal PREV = false;
    bool constant internal NEXT = true;

    uint public balance;
    Registry public stakingRegistry;

    constructor(address tcrAddress) public {
        balance = 0;
        require(tcrAddress != address(0));
        stakingRegistry = Registry(tcrAddress);
    }

    function getStakingRegistry() public view returns (address) {
        return address(stakingRegistry);
    }

    function isExpert(address addr) public view returns(bool) {
        return stakingRegistry.isWhitelisted(bytes32(addr));
    }
}
