/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";
import "../registries/IRegistry.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/// @title ExpertOpinionPolicy - reports that a candidate contract is violated if
///        a specified number of whitelisted security experts vote that it is.

contract ExpertOpinionPolicy is IPolicy {
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
    // The whitelist of security experts
    IRegistry public registry;

    constructor (uint256 minVotes, address contractAddress, address whitelistAddress) public {
        quorum = minVotes;
        candidateContract = contractAddress;
        registry = IRegistry(whitelistAddress);
        numOfVotesAgainst = 0;
        numOfVotesInFavor = 0;
        numOfVotesReceived = 0;
    }

    function vote(bool voteForViolated) public {
        require(registry.isExpert(msg.sender), "Only whitelisted security experts can vote");
        Voter storage sender = voters[msg.sender];
        // Prevent vote changes.
        require(!sender.voted, "Already voted.");
        
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
