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
    // The whitelist of security experts
    IRegistry public registry;
    // Defines the required number of votes before violation can occur
    uint256 public quorum;
    // stores a `Voter` struct for each possible address.
    mapping(address => mapping(address => Voter)) public voters;
    // Counts the totla number of votes received;
    mapping(address => uint256) public numOfVotesReceived;
    // Counts the number of votes recieved in favor of/against violation
    mapping(address => uint256) public numOfVotesInFavor;
    mapping(address => uint256) public numOfVotesAgainst;
    
    constructor (uint256 minVotes, address whitelistAddress) public {
        quorum = minVotes;
        registry = IRegistry(whitelistAddress);
    }


    function vote(address contractAddr, bool voteForViolated) public {
        require(registry.isExpert(msg.sender), "Only whitelisted security experts can vote");
        Voter storage sender = voters[contractAddr][msg.sender];
        // Prevent vote changes.
        require(!sender.voted, "Already voted.");

        numOfVotesReceived[contractAddr] = numOfVotesReceived[contractAddr].add(1);
        sender.voted = true;
        sender.vote = voteForViolated;

        if(voteForViolated) {
          numOfVotesInFavor[contractAddr] = numOfVotesInFavor[contractAddr].add(1);
        } else {
          numOfVotesAgainst[contractAddr] = numOfVotesAgainst[contractAddr].add(1);
        }
    }

    function isViolated(address contractAddr) external view returns(bool) {
        if(numOfVotesReceived[contractAddr] < quorum) { 
            return false; 
        }
        // Require strictly more votes in favor.
        return numOfVotesInFavor[contractAddr] > numOfVotesAgainst[contractAddr];
    }

}
