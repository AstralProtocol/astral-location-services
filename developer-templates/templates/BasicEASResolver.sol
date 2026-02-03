// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title BasicEASResolver
 * @notice Minimal EAS resolver that accepts attestations from a trusted Astral signer
 *         and decodes the boolean policy result. Use as a base for custom logic.
 *
 * Schema (BooleanPolicyAttestation): "bool result, bytes32[] inputRefs, uint256 timestamp, string operation"
 *
 * Dependencies: @ethereum-attestation-service/eas-contracts
 */
contract BasicEASResolver is SchemaResolver {
    address public astralSigner;

    error NotAstralAttester();
    error ZeroAddress();

    event PolicyChecked(address indexed recipient, bool result, string operation);

    constructor(IEAS eas, address _astralSigner) SchemaResolver(eas) {
        if (_astralSigner == address(0)) revert ZeroAddress();
        astralSigner = _astralSigner;
    }

    function onAttest(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal override returns (bool) {
        if (attestation.attester != astralSigner) revert NotAstralAttester();

        (bool result, , , string memory operation) = abi.decode(
            attestation.data,
            (bool, bytes32[], uint256, string)
        );

        emit PolicyChecked(attestation.recipient, result, operation);
        return true;
    }

    function onRevoke(
        Attestation calldata,
        uint256
    ) internal pure override returns (bool) {
        return true;
    }
}
