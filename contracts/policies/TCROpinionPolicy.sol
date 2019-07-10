pragma solidity 0.4.24;

import "./IPolicy.sol";
import {Registry} from "../registries/token-curated-registry/Registry.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title TCROpinionPolicy - reports that a candidate contract is violated if
///        a specified number of TCR members vote that it is.

contract TCROpinionPolicy is IPolicy {
    using SafeMath for uint256;

    // This declares a new complex type which will
    // be used for variables later.
    // It will represent a single voter.
    struct Voter {
        bool voted;  // if true, that person already voted
        bool vote;   // if true, that person is in favor of violation
    }
    // This declares a state variable that
    // stores a `Voter` struct for each possible address.
    mapping(address => Voter) public voters;
    // Defines the required number of votes before violation can occur
    uint256 public quorum;
    // Counts the totla number of votes received;
    uint256 public numOfVotesReceived;
    // Counts the number of votes recieved in favor of/against violation
    uint256 public numOfVotesInFavor;
    uint256 public numOfVotesAgainst;
    // Never directly interact with the candidate, but noted for voter's reference
    address public candidateContract;
    // The TCR for the experts
    Registry public registry;

    constructor (uint256 minVotes, address contractAddress, address tcrAddress) public {
        quorum = minVotes;
        candidateContract = contractAddress;
        registry = Registry(tcrAddress);
        numOfVotesAgainst = 0;
        numOfVotesInFavor = 0;
        numOfVotesReceived = 0;
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

    function vote(bool voteForViolated) public {
        require(isExpert(msg.sender), "Only TCR experts can vote");
        Voter storage sender = voters[msg.sender];
        // Uncomment this line if you want to prevent vote changes.
        //require(!sender.voted, "Already voted.");
        if(!sender.voted){
          numOfVotesReceived = numOfVotesReceived.add(1);
          sender.voted = true;
        } else {
          bool previousVote = sender.vote;
          if (previousVote) {
            numOfVotesInFavor = numOfVotesInFavor.sub(1);
          } else {
            numOfVotesAgainst = numOfVotesAgainst.sub(1);
          }
        }
        sender.vote = voteForViolated;
        if(voteForViolated){
          numOfVotesInFavor = numOfVotesInFavor.add(1);
        } else {
          numOfVotesAgainst = numOfVotesAgainst.add(1);
        }
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == candidateContract);
        if(numOfVotesReceived < quorum) { return false; }
        // Require strictly more votes in favor.
        return numOfVotesInFavor > numOfVotesAgainst;
    }

}
