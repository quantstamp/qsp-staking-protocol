pragma solidity 0.4.24;

import "../IPolicy.sol";
import "../test/Registry.sol";

/// @title TrustedOpinionPolicy
/// @author Jan Gorzny
contract TCROpinionPolicy is IPolicy {

    // This declares a state variable that
    // stores a `Voter` struct for each possible address.
    mapping(address => bool) public voted;

    uint256 minimumNumberOfVotesForViolation;
    uint256 numOfVotesReceived;

    // Never directly interact with the candidate, but noted for voter's reference
    address candidateContract;

    //The TCR for the experts
    Registry registry;

    constructor (uint256 minVotes, address contractAddress, address tcrAddress) public {
        minimumNumberOfVotesForViolation = minVotes;
        candidateContract = contractAddress;
        registry = Registry(tcrAddress);
    }

    /// @dev addr is of type Address which is 20 Bytes, but the TCR expects all
    /// entries to be of type Bytes32. addr is first cast to Uint256 so that it
    /// becomes 32 bytes long, addr is then shifted 12 bytes (96 bits) to the
    /// left so the 20 important bytes are in the correct spot.
    /// @param addr The address of the person who may be an expert.
    /// @return true If addr is on the TCR (is an expert)
    function isExpert(address addr) public view returns(bool) {
        return registry.isWhitelisted(bytes32(uint256(addr) << 96));
    }

    function vote(uint proposal) public {
        require(isExpert(msg.sender), "Only TCR experts can vote");
        require(!voted[msg.sender], "Already voted.");
        voted[msg.sender] = true;

        numOfVotesReceived += 1;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == candidateContract);
        if (numOfVotesReceived >= minimumNumberOfVotesForViolation) {
            return true;
        } else {
            return false;
        }
    }

}
