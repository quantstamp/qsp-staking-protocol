pragma solidity 0.4.24;

/// @title TokenCuratedRegistry - a wrapper around the selected TCR that exposes universal interface
/// @author Quantstamp

import "./token-curated-registry/Registry.sol";
import "./IRegistry.sol";


contract TokenCuratedRegistry is IRegistry {

    Registry public registry;

    /** Initializes the TCR wrapper
    * @param tcrAddress - the address of the security expert token curated registry
    */
    constructor(address tcrAddress) public {
        require(tcrAddress != address(0), "TCR address is 0.");
        registry = Registry(tcrAddress);
    }

    /** @dev addr is of type Address which is 20 Bytes, but the TCR expects all
    * entries to be of type Bytes32. addr is first cast to Uint256 so that it
    * becomes 32 bytes long, addr is then shifted 12 bytes (96 bits) to the
    * left so the 20 important bytes are in the correct spot.
    * @param addr The address of the person who may be an expert.
    * @return true If addr is on the TCR (is an expert)
    */
    function isExpert(address addr) public view returns(bool) {
        return registry.isWhitelisted(bytes32(uint256(addr) << 96));
    }
}
