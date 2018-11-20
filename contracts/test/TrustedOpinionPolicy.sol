pragma solidity 0.4.24;

import "../IPolicy.sol";

// Adapted from https://solidity.readthedocs.io/en/develop/solidity-by-example.html (19 November 2018)

/// @title Voting
contract TrustedOpinionPolicy is IPolicy {

    event Violated(bool value);

    // This declares a new complex type which will
    // be used for variables later.
    // It will represent a single voter.
    struct Voter {
        bool voted;  // if true, that person already voted
        uint vote;   // index of the voted proposal
    }

    // This declares a state variable that
    // stores a `Voter` struct for each possible address.
    mapping(address => Voter) public voters;

    // True if the address' vote should count
    mapping(address => bool) public trusted;

    uint256 minimumNumberOfVotesForViolation;
    uint256 numOfVotesReceived;

    // Never directly interact with the candidate, but noted for voter's reference
    address candidateContract;

    address stakeholder;

    // Give `voter` the right to vote on this ballot.
    // May only be called by `stakeholder`.
    function giveRightToVote(address voter) public {
        require(msg.sender == stakeholder, "Only stakeholder can give right to vote.");
        trusted[voter] = true;
    }

    constructor (uint256 minVotes, address contractAddress, address stakeholderAddress) public {
        minimumNumberOfVotesForViolation = minVotes;
        candidateContract = contractAddress;
        stakeholder = stakeholderAddress;
    }

    function vote(uint proposal) public {
        Voter storage sender = voters[msg.sender];
        require(trusted[msg.sender], "Only trusted addresses can vote");
        require(!sender.voted, "Already voted.");
        sender.voted = true;
        sender.vote = proposal;

        numOfVotesReceived += 1;
    }

    function isViolated(address contractAddress) external view returns(bool) {
        require(contractAddress == candidateContract);
        if (numOfVotesReceived >= minimumNumberOfVotesForViolation) {
            emit Violated(true);
            return true;
        } else {
            emit Violated(false);
            return false;
        }
    }

}
