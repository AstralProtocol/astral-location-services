# Astral Location Services

**PostGIS for Ethereum** - Run geospatial computations that work onchain.

Astral Location Services is a geospatial computation oracle that makes location-based smart contracts possible. Perform spatial operations (distance, containment, intersection) and get back signed attestations you can verify onchain.

## Overview

Built on the [Location Protocol](https://easierdata.org/updates/2025/2025-05-19-location-protocol-spec) and [Ethereum Attestation Service (EAS)](https://attest.org), Astral Location Services provides verifiable geospatial operations for Ethereum. Think of it as a verifiability layer for the incumbent geospatial web - PostGIS, GeoJSON, and Turf.js now work onchain.

## Quick Example

```typescript
import { AstralSDK } from '@astral-protocol/sdk';

const sdk = new AstralSDK({ signer: wallet });

// Create a location attestation
const eiffelTower = await sdk.location.create({
  type: 'Point',
  coordinates: [2.2945, 48.8584]
});

// Check if user is nearby (returns signed attestation)
const proof = await sdk.compute.within(
  userLocationUID,
  eiffelTower.uid,
  500  // 500 meters
);

// Use in smart contract (EAS resolver)
// Resolver verifies signature → mints NFT if nearby
```

See the [Quickstart Guide](./QUICKSTART.md) for a complete walkthrough.

---

## How It Works

**Location Attestations** are signed spatial records (points, polygons, routes) that live onchain or offchain. Reference them by UID.

**Geospatial Operations** compute relationships between locations: distance, containment, intersection, etc. Just like PostGIS or Turf.js.

**Policy Attestations** are signed results of computations. Smart contracts verify these to gate onchain actions by real-world location.

**EAS Resolvers** trigger business logic when attestations are created. This makes location-gated contracts trivial - no manual signature verification needed.

## What You Can Build

- **Local currencies** - Geogated token swaps (only trade if you're in the region)
- **Neighborhood DAOs** - Governance tokens for residents only
- **Proof-of-visit NFTs** - Collectibles for visiting locations
- **Delivery verification** - Escrow that releases when package arrives at right place
- **Location-based games** - Territory control, geocaching with tokens
- **Proximity voting** - Vote weight based on distance to what you're voting on

See [What You Can Build](./WHAT-YOU-CAN-BUILD.md) for detailed examples with code.

---

## Documentation

**Get Started:**
- [Quickstart Guide](./QUICKSTART.md) - Build a location-gated NFT in 10 minutes
- [Goal & Vision](./GOAL.md) - What we're building and why
- [Technical Design](./TECHNICAL-DESIGN.md) - Architecture and implementation details

**Reference:**
- [What You Can Build](./WHAT-YOU-CAN-BUILD.md) - Use cases and patterns
- API Reference *(coming soon)*
- Schema Documentation *(coming soon)*

---

## Status

This is an MVP (v0) focused on developer experience and validation. We're building in public.

**Current:** Centralized oracle (trust Astral's signer)
**Future:** Decentralized verification via AVS, ZK proofs, or TEEs

**Target:** ETHGlobal (a few weeks) - We want to use this to build location-based dapps ourselves.

## Contributing

This project is in active development (v0). Feedback and contributions are welcome!


