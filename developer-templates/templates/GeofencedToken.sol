// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title GeofencedToken
 * @notice ERC20-style token that can only be claimed/minted by addresses that have
 *         a valid Astral policy attestation (e.g. contains(regionUID, userLocationUID)).
 *         Claim is one-time per recipient per round; optional cap per claim.
 *
 * Schema: "bool result, bytes32[] inputRefs, uint256 timestamp, string operation"
 *
 * Dependencies: @ethereum-attestation-service/eas-contracts
 */
contract GeofencedToken is SchemaResolver {
    address public immutable astralSigner;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public hasClaimed;
    uint256 public totalSupply_;
    uint256 public claimAmount;
    bool public mintingOpen;

    event Claimed(address indexed recipient, uint256 amount, bytes32 indexed attestationUID);
    error NotAstralAttester();
    error PolicyFailed();
    error AlreadyClaimed();
    error ZeroAddress();
    error MintingClosed();

    constructor(
        IEAS eas,
        address _astralSigner,
        uint256 _claimAmount
    ) SchemaResolver(eas) {
        if (_astralSigner == address(0)) revert ZeroAddress();
        astralSigner = _astralSigner;
        claimAmount = _claimAmount;
        mintingOpen = true;
    }

    function setMintingOpen(bool open) external {
        // In production: restrict to owner/multisig
        mintingOpen = open;
    }

    function onAttest(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal override returns (bool) {
        if (!mintingOpen) revert MintingClosed();
        if (attestation.attester != astralSigner) revert NotAstralAttester();
        if (hasClaimed[attestation.recipient]) revert AlreadyClaimed();

        (bool result, , , ) = abi.decode(
            attestation.data,
            (bool, bytes32[], uint256, string)
        );
        if (!result) revert PolicyFailed();

        hasClaimed[attestation.recipient] = true;
        balanceOf[attestation.recipient] += claimAmount;
        totalSupply_ += claimAmount;

        emit Claimed(attestation.recipient, claimAmount, attestation.uid);
        return true;
    }

    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }

    function totalSupply() external view returns (uint256) {
        return totalSupply_;
    }
}
