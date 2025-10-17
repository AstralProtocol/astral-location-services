# Goal: Location-Based Services MVP for Ethereum

## What We're Building
**Astral Location Services** - a geospatial computation oracle that makes location-based smart contracts possible. Think "PostGIS for Ethereum" - we provide verifiable geospatial operations that work onchain.

## Core Concepts

**Location Attestations (Input)**
- EAS attestations conforming to Location Protocol schema
- Can be onchain (any EAS deployment) or offchain (EIP-712 signatures)
- Stored anywhere (IPFS, servers, local, etc.)
- Schema inspired by PostGIS geometry tables
- Referenced by UID or passed as raw GeoJSON
- Atomic records in a universal geospatial database

**Geospatial Operations (The Service)**
- Performs spatial computations on attestation UIDs or raw geometry
- Operations: distance, contains, intersects, within, buffer, area, etc.
- **Operations-first, predicates later**: Start with atomic operations (like PostGIS/Turf), compose into higher-level predicates later
- Stateless computation service
- **Complements Turf.js**: Turf for local/UX operations, Astral for verifiable/onchain operations

**Policy Attestations (Output)**
- Signed EAS attestations containing computation results
- Usable offchain (direct consumption) and onchain (via signature verification or EAS resolvers)
- Service holds signing keys to attest to results
- **EAS Resolver Integration**: Resolvers can gate onchain actions based on policy attestation results

## What Already Exists
- Location Protocol data model & schema (EAS-based)
- SDK for interacting with the system
- Onchain registry (EAS contracts)
- API indexer (OGC API Features conformant) for spatial queries
- Plans for location verification/proofs

## Developer Experience

**SDK Structure:**
```javascript
const sdk = new AstralSDK({ signer });

// Work with location attestations
await sdk.location.create(geojson);    // Create location attestation
await sdk.location.get(uid);           // Fetch by UID
await sdk.location.query(filters);     // Search locations

// Compute with verification
await sdk.compute.distance(uid1, uid2);           // → Policy Attestation
await sdk.compute.contains(polygonUID, pointUID); // → Policy Attestation
await sdk.compute.within(pointUID, targetUID, 500); // → Policy Attestation
```

**Use Turf.js for local operations:**
```javascript
// Instant UX feedback (local)
const localDistance = turf.distance(point1, point2);

// Verifiable proof (calls service, returns signed attestation)
const attestedDistance = await sdk.compute.distance(uid1, uid2);
```

**Onchain integration via EAS resolvers:**
```solidity
contract LocationGatedNFT is SchemaResolver {
    function onAttest(Attestation calldata attestation, uint256)
        internal override returns (bool) {
        // Verify from Astral, check policy result, execute logic
        (bool isNearby) = abi.decode(attestation.data, (bool));
        require(isNearby, "Not close enough");
        _mint(attestation.recipient, tokenId);
        return true;
    }
}
```

## Architecture

**Technical:**
- Separate service (independent scaling/deployment)
- Shares Postgres DB with API indexer (read location attestations)
- Accessed via unified API interface at `api.astral.global/compute/*`

**Trust Model (MVP):**
- Centralized service with known signer
- Deterministic operations (same inputs → same outputs)
- Future: decentralize via AVS/ZK proofs/TEEs

## Key Insights

1. **Operations before predicates**: Atomic operations (distance, contains) are building blocks for composed predicates
2. **Complement, don't replace Turf**: Developers use both - Turf for UX, Astral for verification
3. **EAS resolvers unlock the killer use case**: Location-gated smart contracts become trivial
4. **UIDs as first-class but not exclusive**: Accept UIDs (primary) and raw GeoJSON (convenience)
5. **Verifiability layer for geospatial web**: PostGIS/GeoJSON/Turf now compatible with Ethereum
