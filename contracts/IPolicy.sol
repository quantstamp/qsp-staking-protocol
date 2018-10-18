pragma solidity 0.4.24;

interface IPolicy {
    function isViolated(address contractAddress) external view returns(bool);
}