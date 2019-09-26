/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

/// @title ExpertWhitelist - is a temporary centralized registry of experts
/// @author Quantstamp

import "openzeppelin-solidity/contracts/access/Roles.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./IRegistry.sol";

contract WhitelistExpertRegistry is Ownable, IRegistry {
    using Roles for Roles.Role;

    // Emitted when an expert is added
    event ExpertAdded(address indexed account);
      
    // Emitted when an expert is removed
    event ExpertRemoved(address indexed account);

    Roles.Role private experts;

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
