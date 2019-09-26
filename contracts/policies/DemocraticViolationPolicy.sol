/***************************************************************************************************
*                                                                                                  *
* (c) 2018, 2019 Quantstamp, Inc. This content and its use are governed by the license terms at    *
* <https://raw.githubusercontent.com/quantstamp/qsp-staking-protocol/master/LICENSE>               *
*                                                                                                  *
***************************************************************************************************/

pragma solidity 0.4.24;

import "./IPolicy.sol";

// Source adapted from
// https://solidity.readthedocs.io/en/develop/solidity-by-example.html
// (19 November 2018)

/// @title DemocraticViolationPolicy

// A policy that returns true if and only if a number of accounts have submitted
// votes indicating an attack has occurred prior to isViolated being called.
// Note that the sample is not a safe policy to stake on: at any point, someone
// could create several accounts and submit a vote indicating a hack;
// sufficiently many votes would therefore cause the policy to indicate that it
// has been violated.

contract DemocraticViolationPolicy is IPolicy {

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

    uint256 minimumNumberOfVotesForViolation;
    uint256 numOfVotesReceived;

    // Never directly interact with the candidate, but noted for voter's reference
    address candidateContract;

    constructor(uint256 minVotes, address contractAddress) public {
        minimumNumberOfVotesForViolation = minVotes;
        candidateContract = contractAddress;
    }

    function vote(uint proposal) public {
        Voter storage sender = voters[msg.sender];
        require(!sender.voted, "Already voted.");
        sender.voted = true;
        sender.vote = proposal;

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
