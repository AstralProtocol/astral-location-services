// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title DeliveryVerificationEscrow
 * @notice Holds funds until a policy attestation proves delivery location was inside
 *         the delivery zone (e.g. contains(deliveryZoneUID, deliveryLocationUID)).
 *         Beneficiary is set at funding; only confirmDelivery with valid attestation releases.
 *
 * Schema: "bool result, bytes32[] inputRefs, uint256 timestamp, string operation"
 *
 * Dependencies: @ethereum-attestation-service/eas-contracts
 */
contract DeliveryVerificationEscrow {
    IEAS public immutable eas;
    address public immutable astralSigner;
    address public beneficiary;
    address public funder;
    uint256 public amount;
    bool public released;
    bytes32 public attestationUIDUsed;

    event Funded(address indexed funder, address indexed beneficiary, uint256 amount);
    event Released(address indexed beneficiary, uint256 amount, bytes32 attestationUID);
    error NotAstralAttester();
    error PolicyFailed();
    error AlreadyReleased();
    error NotFunded();
    error ZeroAddress();

    constructor(IEAS _eas, address _astralSigner) {
        if (address(_eas) == address(0) || _astralSigner == address(0)) revert ZeroAddress();
        eas = _eas;
        astralSigner = _astralSigner;
    }

    function fund(address _beneficiary) external payable {
        if (_beneficiary == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert NotFunded();
        if (beneficiary != address(0)) revert AlreadyReleased(); // already has a beneficiary
        beneficiary = _beneficiary;
        funder = msg.sender;
        amount = msg.value;
        emit Funded(msg.sender, _beneficiary, amount);
    }

    function confirmDelivery(bytes32 attestationUID) external {
        if (released) revert AlreadyReleased();
        if (beneficiary == address(0)) revert NotFunded();

        Attestation memory att = eas.getAttestation(attestationUID);
        if (att.attester != astralSigner) revert NotAstralAttester();
        if (att.recipient != beneficiary) revert PolicyFailed(); // optional: enforce recipient

        (bool result, , , ) = abi.decode(
            att.data,
            (bool, bytes32[], uint256, string)
        );
        if (!result) revert PolicyFailed();

        released = true;
        attestationUIDUsed = attestationUID;
        (bool ok, ) = payable(beneficiary).call{value: amount}("");
        require(ok, "Transfer failed");
        emit Released(beneficiary, amount, attestationUID);
    }
}
