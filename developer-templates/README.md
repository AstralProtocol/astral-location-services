# Developer templates and examples

Runnable templates, examples, and tests for [Astral Location Services](https://github.com/AstralProtocol/astral-location-services). Use these to copy/paste working code and reduce friction when building location-gated apps.

## Contents

### Templates ([templates/](templates/))

| Template | Description |
|----------|-------------|
| **BasicEASResolver** | Minimal EAS resolver: verifies Astral signer and decodes boolean policy result. Base for custom logic. |
| **LocationGatedNFT** | Mints one NFT per recipient when policy result is true (e.g. within 500m of a landmark). |
| **GeofencedToken** | ERC20-style claim: one-time claim per recipient when containment attestation is valid. |
| **DeliveryVerificationEscrow** | Holds ETH until `confirmDelivery(attestationUID)` with a valid containment attestation. |

Schema: `bool result, bytes32[] inputRefs, uint256 timestamp, string operation`. Register with EAS Schema Registry and use the returned schema UID in `astral.compute.within()` / `contains()` / `intersects()`.

### Examples ([examples/](examples/))

| Example | Description |
|---------|-------------|
| **foundry** | Foundry project: deploy resolvers and EAS/schema, run contract tests. `forge test`, `forge script`. |
| **frontend** | React/Next.js: connect wallet, run `within` check, submit delegated attestation. |
| **e2e-workflow** | Node script: compute `within` and optionally submit onchain (env: `RESOLVER_SCHEMA_UID`, `PRIVATE_KEY`, `RPC_URL`). |
| **mobile** | Stub and pattern for React Native: location + Astral `within` (implement with your stack). |

### Tests ([tests/](tests/))

| Test | Description |
|------|-------------|
| **contracts** | Foundry tests in `examples/foundry`: deploy EAS + resolvers, attest, assert NFT mint / token claim / escrow release. |
| **sdk** | Vitest: call `astral.within()` and assert result shape (set `ASTRAL_API_URL`, `RESOLVER_SCHEMA_UID` to run). |

## Quick start

1. **Contracts (Foundry)**  
   `cd examples/foundry && forge install && forge build && forge test`

2. **Deploy resolvers**  
   Set `ASTRAL_SIGNER` and `PRIVATE_KEY`, then `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast`. Use the printed schema UIDs in your app.

3. **Frontend**  
   `cd examples/frontend`, set `NEXT_PUBLIC_RESOLVER_SCHEMA_UID` and `NEXT_PUBLIC_CHAIN_ID`, then `npm run dev`.

4. **E2E**  
   `cd examples/e2e-workflow`, set `RESOLVER_SCHEMA_UID`, then `npx tsx run.ts`.

## Prerequisites

- Node 18+
- Foundry (for contracts and deployment)
- Wallet with testnet ETH for onchain submit (e.g. Base Sepolia)
- Astral API access (default: `https://api.astral.global`)

## Monorepo note

Examples that use `@decentralized-geo/astral-compute` rely on `workspace:*` when run from the repo root after `npm install`. From a standalone copy, install the published package: `npm install @decentralized-geo/astral-compute`.
