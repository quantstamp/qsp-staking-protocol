pragma solidity 0.4.24;

/// @title IPolicy - is the interface that all policies must implement in the Staking Protocol

interface IPolicy {
    function isViolated(address contractAddress) external view returns(bool);
}
