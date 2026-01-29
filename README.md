# Astral Location Services

> ⚠️ **Development Preview** - This project is under active development and not yet production-ready. APIs may change. See the `develop` branch for latest work; `main` will be used for stable releases.

**Verifiable geospatial computation for Ethereum** - Run spatial operations in a TEE and get signed attestations for onchain use.

Astral Location Services is a geospatial computation oracle that makes location-based smart contracts possible. Perform spatial operations (distance, containment, intersection) and get back signed attestations you can register on EAS. Using EAS resolvers, these policy attestations can be connected to any smart contract.

## Overview

Built on the [Location Protocol](https://easierdata.org/updates/2025/2025-05-19-location-protocol-spec) and [Ethereum Attestation Service (EAS)](https://attest.org), Astral Location Services provides verifiable geospatial operations for Ethereum.

**Key features:**
- **Verifiable computation** via EigenCompute (TEE environment)
- **PostGIS-powered** spatial operations (distance, contains, intersects, within, area)
- **EAS integration** with delegated attestations for onchain use
- **SDK-first** developer experience

## Quick Example

```typescript
import { AstralSDK } from '@decentralized-geo/astral-sdk';

const astral = new AstralSDK();

// Check if user is within 500m of landmark
const result = await astral.compute.within(
  userLocationUID,
  landmarkUID,
  500,
  { schema: RESOLVER_SCHEMA, recipient: userAddress }
);

console.log(`Nearby: ${result.result}`);

// Submit onchain (developer pays gas, Astral is attester)
const tx = await astral.eas.submitDelegated(result.delegatedAttestation);
```

See the [Quickstart Guide](./docs/QUICKSTART.md) for a complete walkthrough.

---

## How It Works

1. **Location Attestations** are signed spatial records (points, polygons, routes) that conform to Location Protocol. Reference them by UID.

2. **Geospatial Operations** compute relationships between locations: distance, containment, intersection, etc. Operations run in a TEE via EigenCompute.

3. **Policy Attestations** are signed results of computations. Smart contracts verify these to gate onchain actions by real-world location.

4. **EAS Resolvers** trigger business logic when attestations are created. Location-gated contracts become trivial - no manual signature verification needed.

## What You Can Build

- **Local currencies** - Geogated token swaps (only trade if you're in the region)
- **Neighborhood DAOs** - Governance tokens for residents only
- **Proof-of-visit NFTs** - Collectibles for visiting locations
- **Delivery verification** - Escrow that releases when package arrives
- **Location-based games** - Territory control, geocaching with tokens
- **Proximity voting** - Vote weight based on distance

See [What You Can Build](./docs/WHAT-YOU-CAN-BUILD.md) for detailed examples.

---

## Documentation

| Document | Description |
|----------|-------------|
| [SPEC.md](./SPEC.md) | **Technical specification** - Architecture, API, SDK, schemas, security |
| [QUICKSTART.md](./docs/QUICKSTART.md) | Developer tutorial - Build a location-gated NFT |
| [GOAL.md](./docs/GOAL.md) | Vision and core concepts |
| [WHAT-YOU-CAN-BUILD.md](./docs/WHAT-YOU-CAN-BUILD.md) | Use cases and patterns |

---

## Architecture

```
Developer App → Astral SDK → Compute Service (EigenCompute TEE) → Policy Attestation
                                     ↓
                              PostGIS (in-container)
```

The compute service runs in EigenCompute's TEE environment with PostGIS inside the container, enabling verifiable geospatial computation.

See [SPEC.md](./SPEC.md) for detailed architecture.

---

## Status

**Version:** 0.1.0 (MVP)

This is an MVP focused on developer experience and learning. Building as part of the EigenLayer Open Innovation Program.

**Trust Model:**
- Centralized service with known signer running in TEE (EigenCompute)
- Future: Additional verifiability options (AVS consensus, ZK proofs)

## Contributing

This project is in active development. Feedback and contributions welcome!

---

## Links

- [Astral Protocol](https://astral.global)
- [Location Protocol Spec](https://easierdata.org/updates/2025/2025-05-19-location-protocol-spec)
- [EigenCompute](https://blog.eigencloud.xyz/eigencloud-brings-verifiable-ai-to-mass-market-with-eigenai-and-eigencompute-launches/)
- [EAS Documentation](https://docs.attest.org)
