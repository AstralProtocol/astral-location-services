// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title LocationGatedNFT
 * @notice Example resolver that mints NFTs based on location verification from Astral
 *
 * @dev This contract demonstrates how to use Astral Location Services attestations
 * to gate NFT minting based on geospatial predicates (e.g., "user is within 1km of venue").
 *
 * Flow:
 * 1. User requests location proof from Astral (e.g., "within" check)
 * 2. Astral returns a signed delegated attestation
 * 3. User submits the attestation to EAS with this contract as resolver
 * 4. This contract verifies:
 *    - Attestation is from trusted Astral signer
 *    - Boolean result is true (location check passed)
 * 5. If valid, an NFT is minted to the recipient
 */
contract LocationGatedNFT is SchemaResolver {
    /// @notice Trusted Astral attester address
    address public immutable astralSigner;

    /// @notice Counter for token IDs
    uint256 private _tokenIdCounter;

    /// @notice Mapping of token ownership
    mapping(uint256 => address) public ownerOf;

    /// @notice Mapping of address to tokens owned
    mapping(address => uint256[]) public tokensOf;

    /// @notice Emitted when a new NFT is minted
    event Minted(address indexed recipient, uint256 indexed tokenId, bytes32 indexed attestationUID);

    /// @notice Emitted when location verification fails
    event VerificationFailed(address indexed recipient, string reason);

    error NotAstralAttester();
    error LocationCheckFailed();
    error ZeroAddress();

    /**
     * @param eas The EAS contract address
     * @param _astralSigner The trusted Astral attester address
     */
    constructor(IEAS eas, address _astralSigner) SchemaResolver(eas) {
        if (_astralSigner == address(0)) revert ZeroAddress();
        astralSigner = _astralSigner;
    }

    /**
     * @notice Called by EAS when an attestation is made with this resolver
     * @param attestation The attestation data
     * @return Whether the attestation should be accepted
     */
    function onAttest(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal override returns (bool) {
        // Verify attester is the trusted Astral signer
        if (attestation.attester != astralSigner) {
            emit VerificationFailed(attestation.recipient, "Not from Astral");
            revert NotAstralAttester();
        }

        // Decode the boolean policy attestation
        // Schema: "bool result, bytes32[] inputRefs, uint256 timestamp, string operation"
        (bool result, , , ) = abi.decode(
            attestation.data,
            (bool, bytes32[], uint256, string)
        );

        // Require the location check to have passed
        if (!result) {
            emit VerificationFailed(attestation.recipient, "Location check failed");
            revert LocationCheckFailed();
        }

        // Mint NFT to recipient
        _mint(attestation.recipient, attestation.uid);

        return true;
    }

    /**
     * @notice Called by EAS when an attestation is revoked
     * @return Whether the revocation should be accepted
     */
    function onRevoke(
        Attestation calldata /* attestation */,
        uint256 /* value */
    ) internal pure override returns (bool) {
        // Allow revocations (could add logic to burn the NFT here)
        return true;
    }

    /**
     * @notice Internal function to mint an NFT
     * @param to The recipient address
     * @param attestationUID The attestation UID (used for event tracking)
     */
    function _mint(address to, bytes32 attestationUID) internal {
        uint256 tokenId = ++_tokenIdCounter;
        ownerOf[tokenId] = to;
        tokensOf[to].push(tokenId);

        emit Minted(to, tokenId, attestationUID);
    }

    /**
     * @notice Get the total number of tokens minted
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @notice Get the number of tokens owned by an address
     */
    function balanceOf(address owner) external view returns (uint256) {
        return tokensOf[owner].length;
    }
}
