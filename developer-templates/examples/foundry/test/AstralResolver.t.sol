// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {IEAS, AttestationRequest, AttestationRequestData} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {ISchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/ISchemaResolver.sol";
import {SchemaRegistry} from "@ethereum-attestation-service/eas-contracts/contracts/SchemaRegistry.sol";
import {EAS} from "@ethereum-attestation-service/eas-contracts/contracts/EAS.sol";
import {BasicEASResolver} from "../src/BasicEASResolver.sol";
import {LocationGatedNFT} from "../src/LocationGatedNFT.sol";
import {GeofencedToken} from "../src/GeofencedToken.sol";
import {DeliveryVerificationEscrow} from "../src/DeliveryVerificationEscrow.sol";

contract AstralResolverTest is Test {
    SchemaRegistry public registry;
    EAS public eas;
    address public astralSigner;
    address public user;
    bytes32 public schemaUid;

    string public constant BOOLEAN_SCHEMA = "bool result, bytes32[] inputRefs, uint256 timestamp, string operation";

    function setUp() public {
        astralSigner = makeAddr("astral");
        user = makeAddr("user");
        registry = new SchemaRegistry();
        eas = new EAS(registry);
    }

    function _registerResolver(ISchemaResolver resolver) internal returns (bytes32) {
        return registry.register(BOOLEAN_SCHEMA, resolver, true);
    }

    function _encodeAttestationData(bool result) internal view returns (bytes memory) {
        bytes32[] memory inputRefs = new bytes32[](1);
        inputRefs[0] = keccak256("input1");
        return abi.encode(result, inputRefs, uint256(block.timestamp), "within");
    }

    function test_BasicEASResolver_acceptsValidAttestation() public {
        BasicEASResolver resolver = new BasicEASResolver(IEAS(address(eas)), astralSigner);
        schemaUid = _registerResolver(resolver);

        vm.prank(astralSigner);
        AttestationRequestData memory data = AttestationRequestData({
            recipient: user,
            expirationTime: 0,
            revocable: true,
            refUID: bytes32(0),
            data: _encodeAttestationData(true),
            value: 0
        });
        bytes32 uid = eas.attest(AttestationRequest({schema: schemaUid, data: data}));
        assertTrue(uid != bytes32(0));
    }

    function test_BasicEASResolver_revertsWrongAttester() public {
        BasicEASResolver resolver = new BasicEASResolver(IEAS(address(eas)), astralSigner);
        schemaUid = _registerResolver(resolver);

        vm.prank(user);
        vm.expectRevert();
        AttestationRequestData memory data = AttestationRequestData({
            recipient: user,
            expirationTime: 0,
            revocable: true,
            refUID: bytes32(0),
            data: _encodeAttestationData(true),
            value: 0
        });
        eas.attest(AttestationRequest({schema: schemaUid, data: data}));
    }

    function test_LocationGatedNFT_mintsOnValidAttestation() public {
        LocationGatedNFT nft = new LocationGatedNFT(IEAS(address(eas)), astralSigner);
        schemaUid = _registerResolver(nft);

        assertEq(nft.balanceOf(user), 0);
        vm.prank(astralSigner);
        AttestationRequestData memory data = AttestationRequestData({
            recipient: user,
            expirationTime: 0,
            revocable: true,
            refUID: bytes32(0),
            data: _encodeAttestationData(true),
            value: 0
        });
        eas.attest(AttestationRequest({schema: schemaUid, data: data}));

        assertEq(nft.balanceOf(user), 1);
        assertEq(nft.totalSupply(), 1);
    }

    function test_LocationGatedNFT_revertsOnFailedPolicy() public {
        LocationGatedNFT nft = new LocationGatedNFT(IEAS(address(eas)), astralSigner);
        schemaUid = _registerResolver(nft);

        vm.prank(astralSigner);
        vm.expectRevert();
        AttestationRequestData memory data = AttestationRequestData({
            recipient: user,
            expirationTime: 0,
            revocable: true,
            refUID: bytes32(0),
            data: _encodeAttestationData(false),
            value: 0
        });
        eas.attest(AttestationRequest({schema: schemaUid, data: data}));
    }

    function test_GeofencedToken_claimsOnValidAttestation() public {
        GeofencedToken token = new GeofencedToken(IEAS(address(eas)), astralSigner, 1000e18);
        schemaUid = _registerResolver(token);

        vm.prank(astralSigner);
        AttestationRequestData memory data = AttestationRequestData({
            recipient: user,
            expirationTime: 0,
            revocable: true,
            refUID: bytes32(0),
            data: _encodeAttestationData(true),
            value: 0
        });
        eas.attest(AttestationRequest({schema: schemaUid, data: data}));

        assertEq(token.balanceOf(user), 1000e18);
        assertEq(token.totalSupply(), 1000e18);
    }

    function test_DeliveryVerificationEscrow_releasesOnValidAttestation() public {
        DeliveryVerificationEscrow escrow = new DeliveryVerificationEscrow(IEAS(address(eas)), astralSigner);
        BasicEASResolver helperResolver = new BasicEASResolver(IEAS(address(eas)), astralSigner);
        schemaUid = _registerResolver(helperResolver);

        vm.deal(user, 1 ether);
        vm.prank(user);
        escrow.fund{value: 1 ether}(beneficiary());

        bytes32 attestationUid;
        vm.prank(astralSigner);
        {
            AttestationRequestData memory data = AttestationRequestData({
                recipient: beneficiary(),
                expirationTime: 0,
                revocable: true,
                refUID: bytes32(0),
                data: _encodeAttestationData(true),
                value: 0
            });
            attestationUid = eas.attest(AttestationRequest({schema: schemaUid, data: data}));
        }

        uint256 before = address(beneficiary()).balance;
        vm.prank(user);
        escrow.confirmDelivery(attestationUid);
        assertEq(address(beneficiary()).balance - before, 1 ether);
        assertTrue(escrow.released());
    }

    function beneficiary() internal pure returns (address) {
        return address(0xBEEF);
    }
}
