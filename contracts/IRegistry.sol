pragma solidity 0.4.24;

/// @title IRegistry - interface for TCRs and whitelists that the protocol uses to check experts
/// @author Quantstamp

interface IRegistry {
    function isExpert(address account) external view returns(bool);
}
