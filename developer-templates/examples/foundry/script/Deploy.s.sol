// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {IEAS} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {SchemaRegistry} from "@ethereum-attestation-service/eas-contracts/contracts/SchemaRegistry.sol";
import {EAS} from "@ethereum-attestation-service/eas-contracts/contracts/EAS.sol";
import {BasicEASResolver} from "../src/BasicEASResolver.sol";
import {LocationGatedNFT} from "../src/LocationGatedNFT.sol";
import {GeofencedToken} from "../src/GeofencedToken.sol";
import {DeliveryVerificationEscrow} from "../src/DeliveryVerificationEscrow.sol";

contract DeployScript is Script {
    function run() external {
        address astralSigner = vm.envAddress("ASTRAL_SIGNER");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        SchemaRegistry registry = new SchemaRegistry();
        EAS eas = new EAS(registry);

        BasicEASResolver basicResolver = new BasicEASResolver(IEAS(address(eas)), astralSigner);
        LocationGatedNFT nftResolver = new LocationGatedNFT(IEAS(address(eas)), astralSigner);
        GeofencedToken tokenResolver = new GeofencedToken(IEAS(address(eas)), astralSigner, 1000e18);
        DeliveryVerificationEscrow escrow = new DeliveryVerificationEscrow(IEAS(address(eas)), astralSigner);

        string memory booleanSchema = "bool result, bytes32[] inputRefs, uint256 timestamp, string operation";
        bytes32 basicSchemaUid = registry.register(booleanSchema, basicResolver, true);
        bytes32 nftSchemaUid = registry.register(booleanSchema, nftResolver, true);
        bytes32 tokenSchemaUid = registry.register(booleanSchema, tokenResolver, true);

        vm.stopBroadcast();

        console.log("SchemaRegistry", address(registry));
        console.log("EAS", address(eas));
        console.log("BasicEASResolver", address(basicResolver));
        console.log("LocationGatedNFT", address(nftResolver));
        console.log("GeofencedToken", address(tokenResolver));
        console.log("DeliveryVerificationEscrow", address(escrow));
        console.log("Register schema and use registry.getSchema(uid) for schema UIDs");
    }
}
