pragma solidity 0.4.24;

/// @title ExpertWhitelist - is a temporary centralized registry of experts
/// @author Quantstamp

import "openzeppelin-solidity/contracts/access/Roles.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract WhitelistExpertRegistry is Ownable, IRegistry {
    using Roles for Roles.Role;

    // Emitted when an expert is added
    event ExpertAdded(address indexed account);
      
    // Emitted when an expert is removed
    event ExpertRemoved(address indexed account);

    Roles.Role private experts;

    /** Creates the whitelist owned by the message sender. */
    constructor() public {
    }

    /** Returns true if an address is an expert. This is consistent
    * with the TCR interface.
    * @param account - the address to be checked
    */
    function isExpert(address account) public view returns (bool) {
        return experts.has(account);
    }

    /** Adds the address to the list of experts. Callable only by the owner.
    * @param account - the address to be added
    */
    function addExpert(address account) public onlyOwner {
        experts.add(account);
        emit ExpertAdded(account);
    }

    /** Removes an address from the list of experts. Callable only by the owner.
    * @param account - the address to be removed
    */
    function removeExpert(address account) public onlyOwner {
        experts.remove(account);
        emit ExpertRemoved(account);
    }
}

