pragma solidity 0.4.24;

import "./IPolicy.sol";

/// @title TrustedOraclePolicy - the policy is violated if a trusted oracle says it is.

contract TrustedOraclePolicy is IPolicy {

    // The address of the trusted oracle
    address internal oracleAddress;

    // Whether or not the policy of a certain contract is or was violated
    mapping(address => bool) internal policyViolated;

    /** Allows execution only when the trusted oracle is the msg.sender. */
    modifier onlyTrustedOracle() {
        require(oracleAddress == msg.sender, "Msg.sender is not trusted oracle.");
        _;
    }

    /** This policy contract can be deployed once and its address can be used for
     * several candidate contracts that are being monitored by this trusted oracle.
     * @param _oracleAddress - The Ethereum address of the trusted oracle.
     */
    constructor(address _oracleAddress) public {
        oracleAddress = _oracleAddress;
    }

    /** This function can only be called by the trusted oracle and it shold only be called
     * when a policy violation occured.
     * @param _contractAddress - The address of the contract for which the policy violation occured.
     */
    function triggerViolation(address _contractAddress) external onlyTrustedOracle() {
        policyViolated[_contractAddress] = true;
    }

    /** This function indicates if the policy of the given contract address is violated or not.
     * If the given contract address is not being monitored by the trusted oracle in this policy,
     * then this function will always return false even if the policy is violated. It is the responsibility
     * of the pool owner to make sure that this contract address is being monitored by the oracle.
     * @param _contractAddress - The address of the contract for which the policy status is to be checked.
     * @return True if the policy is violated, false otherwise.
     */
    function isViolated(address _contractAddress) external view returns(bool) {
        return policyViolated[_contractAddress];
    }

    /** This function allows external callers to check what the oracle address in this policy is.
     * @return The address of the trusted oracle corresponding to this policy.
     */
    function getOracleAddress() external view returns(address) {
        return oracleAddress;
    }
}
