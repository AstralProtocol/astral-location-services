# Contract Templates

Copy-paste Solidity templates for Astral Location Services. All use the **BooleanPolicyAttestation** schema:

`bool result, bytes32[] inputRefs, uint256 timestamp, string operation`

## Dependencies

- [@ethereum-attestation-service/eas-contracts](https://github.com/ethereum-attestation-service/eas-contracts)

Install with Foundry: `forge install ethereum-attestation-service/eas-contracts` and add remapping in `foundry.toml`.

## Templates

| Template | Description |
|----------|-------------|
| **BasicEASResolver** | Minimal resolver: verifies Astral signer and decodes boolean result. Use as base for custom logic. |
| **LocationGatedNFT** | Mints one NFT per recipient when policy result is true (e.g. within 500m of landmark). |
| **GeofencedToken** | ERC20-style claim: recipients with valid containment attestation can claim a fixed token amount once. |
| **DeliveryVerificationEscrow** | Holds ETH until `confirmDelivery(attestationUID)` is called with an attestation proving delivery zone containment. |

## Schema UID

Register the boolean schema with EAS Schema Registry and point it at your resolver. Use the returned schema UID when calling `astral.compute.within()` / `contains()` / `intersects()` so attestations are issued for this resolver.
