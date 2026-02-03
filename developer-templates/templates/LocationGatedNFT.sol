// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title LocationGatedNFT
 * @notice Mints an NFT to the attestation recipient when Astral's policy result is true
 *         (e.g. user within 500m of a landmark). One mint per recipient.
 *
 * Schema: "bool result, bytes32[] inputRefs, uint256 timestamp, string operation"
 *
 * Dependencies: @ethereum-attestation-service/eas-contracts
 */
contract LocationGatedNFT is SchemaResolver {
    address public immutable astralSigner;
    uint256 private _tokenIdCounter;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256[]) public tokensOf;
    mapping(address => bool) public hasMinted;

    event Minted(address indexed recipient, uint256 indexed tokenId, bytes32 indexed attestationUID);
    error NotAstralAttester();
    error LocationCheckFailed();
    error AlreadyMinted();
    error ZeroAddress();

    constructor(IEAS eas, address _astralSigner) SchemaResolver(eas) {
        if (_astralSigner == address(0)) revert ZeroAddress();
        astralSigner = _astralSigner;
    }

    function onAttest(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal override returns (bool) {
        if (attestation.attester != astralSigner) revert NotAstralAttester();
        if (hasMinted[attestation.recipient]) revert AlreadyMinted();

        (bool result, , , ) = abi.decode(
            attestation.data,
            (bool, bytes32[], uint256, string)
        );
        if (!result) revert LocationCheckFailed();

        hasMinted[attestation.recipient] = true;
        uint256 tokenId = ++_tokenIdCounter;
        ownerOf[tokenId] = attestation.recipient;
        tokensOf[attestation.recipient].push(tokenId);

        emit Minted(attestation.recipient, tokenId, attestation.uid);
        return true;
    }

    function onRevoke(Attestation calldata, uint256) internal pure override returns (bool) {
        return true;
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return tokensOf[owner].length;
    }
}
