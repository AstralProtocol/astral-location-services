# Astral Location Services - Technical Specification

**Version:** 0.1.0 (MVP)
**Status:** Draft
**Last Updated:** 2025-01-27

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [EigenCloud Integration](#eigencloud-integration)
4. [Core Operations](#core-operations)
5. [Data Models](#data-models)
6. [API Design](#api-design)
7. [SDK Design](#sdk-design)
8. [Authentication](#authentication)
9. [Onchain Integration](#onchain-integration)
10. [Input Handling](#input-handling)
11. [Error Handling](#error-handling)
12. [Tech Stack](#tech-stack)
13. [Deployment](#deployment)
14. [Security Considerations](#security-considerations)
15. [Open Questions](#open-questions)

---

## Overview

### What This Is

Astral Location Services is a **verifiable geospatial computation service** that performs spatial operations on location data and outputs signed EAS attestations. It enables location-based smart contracts by providing trustworthy geospatial computations that can be verified onchain.

### Core Value Proposition

- **Input:** Location attestations (EAS format) or raw GeoJSON
- **Processing:** Geospatial computations in a verifiable environment (TEE)
- **Output:** Signed Policy Attestations usable offchain and onchain

### Design Principles

- **Developer experience first:** Clear, intuitive SDK and API
- **Web3 native:** EAS attestations as the data model, wallet-based identity
- **Verifiable computation:** Operations run in TEE via EigenCompute
- **Complement Turf.js:** Use Turf for local/UX operations, Astral for verifiable/onchain operations
- **MVP mindset:** Build for learning and iteration, defer complexity

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Developer Application                                        │
│  - Collects user location                                     │
│  - Calls Astral SDK                                           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  Astral SDK (@decentralized-geo/astral-sdk)                            │
│  - astral.location.* (create, get, query attestations)           │
│  - astral.compute.* (distance, contains, intersects, etc.)       │
│  - Handles request signing, attestation decoding              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  Astral API Gateway (api.astral.global)                       │
│                                                               │
│  /locations/*     → Indexer Service (existing)                │
│  /compute/*       → Compute Service (this spec)               │
└──────┬───────────────────────────────────┬───────────────────┘
       │                                   │
       ▼                                   ▼
┌─────────────────┐         ┌─────────────────────────────────┐
│  Indexer        │         │  Compute Service                │
│  Service        │         │  (runs in EigenCompute TEE)     │
│  (existing)     │         │                                 │
│                 │         │  ┌───────────────────────────┐  │
│  - Syncs EAS    │         │  │  TypeScript API Layer     │  │
│  - OGC Features │         │  │  - Request validation     │  │
│                 │         │  │  - Attestation signing    │  │
└─────────────────┘         │  │  - EAS integration        │  │
                            │  └─────────────┬─────────────┘  │
                            │                │                │
                            │  ┌─────────────▼─────────────┐  │
                            │  │  PostgreSQL + PostGIS     │  │
                            │  │  - Spatial computations   │  │
                            │  │  - In-container (no ext.) │  │
                            │  └───────────────────────────┘  │
                            └─────────────────────────────────┘
```

### Key Architectural Decisions

1. **Separate Service:** Compute service is deployed independently from the indexer. Shares nothing at runtime for verifiability.

2. **Self-Contained Container:** PostGIS runs inside the Docker container, not external. This enables verifiable computation in TEE.

3. **Stateless Model:** Each request brings all inputs. No persistent state. Caching may be added later if performance requires it.

4. **Delegated Attestations:** Developer submits Policy Attestations onchain using EAS delegated attestation pattern. Astral signs, developer pays gas, Astral is recorded as attester.

---

## EigenCloud Integration

### Why EigenCompute

Astral Location Services runs on **EigenCompute**, part of the EigenCloud ecosystem. This provides:

- **Verifiable Execution:** Code runs in a TEE (Trusted Execution Environment)
- **Attestation:** TEE attests that code executed correctly and data wasn't tampered with
- **Future-Proof:** Path to additional verifiability options (cryptoeconomic security, ZK proofs)

### Deployment Model

```
┌─────────────────────────────────────────────────────┐
│           EigenCompute TEE Environment              │
│  ┌───────────────────────────────────────────────┐  │
│  │         Docker Container                      │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  Astral Compute Service                 │  │  │
│  │  │  - TypeScript/Node.js API               │  │  │
│  │  │  - Request validation                   │  │  │
│  │  │  - Signature verification               │  │  │
│  │  │  - PostGIS query execution              │  │  │
│  │  │  - Policy Attestation signing           │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  PostgreSQL + PostGIS                   │  │  │
│  │  │  - ST_Distance, ST_Contains, etc.       │  │  │
│  │  │  - Ephemeral (no persistent state)      │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Verifiability Properties

1. **Input Verification:** Attestation signatures verified at TEE boundary
2. **Deterministic Computation:** Same inputs always produce same result
3. **Signed Output:** Service key signs Policy Attestation inside TEE
4. **TEE Attestation:** EigenCompute provides hardware attestation of execution

### Service Signing Key

- Service holds a signing key inside the TEE
- Key is used to sign all Policy Attestations
- Resolver contracts verify `attestation.attester` matches known Astral signer
- **Key rotation:** Signer address in resolver contracts should be updateable via multisig

---

## Core Operations

### MVP Scope

The MVP includes **predicates** (boolean results) and **measurements** (numeric results). No transformations (geometry outputs) for MVP.

| Operation | Type | Description | PostGIS Function |
|-----------|------|-------------|------------------|
| `distance` | Measurement | Distance between two geometries | `ST_Distance` |
| `area` | Measurement | Area of a polygon | `ST_Area` |
| `length` | Measurement | Length of a line | `ST_Length` |
| `contains` | Predicate | Is geometry B inside geometry A? | `ST_Contains` |
| `within` | Predicate | Is point within distance of target? | `ST_DWithin` |
| `intersects` | Predicate | Do geometries overlap? | `ST_Intersects` |

### Operation Signatures

```typescript
// Measurements (return numbers)
astral.compute.distance(input1: Input, input2: Input, options?: ComputeOptions): Promise<NumericPolicyAttestation>
astral.compute.area(input: Input, options?: ComputeOptions): Promise<NumericPolicyAttestation>
astral.compute.length(input: Input, options?: ComputeOptions): Promise<NumericPolicyAttestation>

// Predicates (return booleans)
astral.compute.contains(container: Input, containee: Input, options?: ComputeOptions): Promise<BooleanPolicyAttestation>
astral.compute.within(point: Input, target: Input, radius: number, options?: ComputeOptions): Promise<BooleanPolicyAttestation>
astral.compute.intersects(geom1: Input, geom2: Input, options?: ComputeOptions): Promise<BooleanPolicyAttestation>
```

### Future Operations (Post-MVP)
- `disjoint` - Do geometries not touch?
- `buffer` - Create buffer zone around geometry
- `centroid` - Find center point
- `union` - Merge geometries
- `intersection` - Overlapping area

---

## Data Models

### Input Types

```typescript
type Input =
  | string                              // Onchain attestation UID (fetched from EAS)
  | GeoJSON.Geometry                    // Raw GeoJSON geometry
  | GeoJSON.Feature                     // GeoJSON Feature
  | { attestation: OffchainAttestation } // Full signed offchain attestation
  | { uid: string, uri: string }        // Offchain attestation by reference
```

**Input resolution:**

| Input Format | Resolution |
|--------------|------------|
| UID string | Fetch from EAS contracts (onchain only) |
| Raw GeoJSON | Use directly, hash for `inputRefs` |
| `{ attestation }` | Verify signature, extract geometry |
| `{ uid, uri }` | Fetch from URI, verify UID matches, verify signature |

**Why UID+URI for offchain?** The UID acts as a checksum. Even if fetching from an HTTPS URL (not content-addressed), we verify the fetched attestation's UID matches the declared UID. Mismatch = reject. IPFS CIDs are preferred but not required.

### Policy Attestation Schemas

**Decision:** Per-result-type schemas. SDK auto-selects based on operation.

#### BooleanPolicyAttestation Schema

```solidity
// Schema: "bool result, bytes32[] inputRefs, uint256 timestamp, string operation"
struct BooleanPolicyAttestation {
    bool result;              // The boolean result
    bytes32[] inputRefs;      // Input references (see below)
    uint256 timestamp;        // When computation was performed
    string operation;         // "contains", "within", "intersects"
}
```

#### NumericPolicyAttestation Schema

```solidity
// Schema: "uint256 result, string units, bytes32[] inputRefs, uint256 timestamp, string operation"
struct NumericPolicyAttestation {
    uint256 result;           // Scaled integer (centimeters for distance/length, cm² for area)
    string units;             // "meters" or "square_meters" (indicates base unit before scaling)
    bytes32[] inputRefs;      // Input references (see below)
    uint256 timestamp;        // When computation was performed
    string operation;         // "distance", "length", "area"
}
```

#### Input References (`inputRefs`)

The `inputRefs` array contains a bytes32 reference for each input:

| Input Type | Reference Value |
|------------|-----------------|
| Location Attestation UID | The UID itself |
| Raw GeoJSON | `keccak256(abi.encode(geojson))` |
| Offchain attestation | The attestation UID |

This enables verification that specific inputs were used in the computation. For raw GeoJSON, the hash allows verification if the original geometry is known, but does not reveal the geometry itself.

**Privacy note:** Hashing raw geometry creates a fingerprint. For privacy-sensitive use cases, future versions may support commitments or ZK proofs.

**Scaling:** Results stored as integers with centimeter precision. To get meters, divide by 100. To get square meters, divide by 10000.

#### GeometryPolicyAttestation Schema (Future)

```solidity
// Schema: "bytes geometry, string geometryType, bytes32[] inputRefs, uint256 timestamp, string operation"
struct GeometryPolicyAttestation {
    bytes geometry;           // Encoded geometry result
    string geometryType;      // "Point", "Polygon", etc.
    bytes32[] inputRefs;      // Input references (UIDs or hashes)
    uint256 timestamp;        // When computation was performed
    string operation;         // "buffer", "centroid", "union"
}
```

### SDK Return Objects

```typescript
interface PolicyAttestationResult<T> {
  // Decoded result (convenience)
  result: T;                          // boolean | number | GeoJSON.Geometry
  units?: string;                     // For measurements
  operation: string;                  // Operation name
  timestamp: number;                  // Unix timestamp
  inputRefs: string[];                // Input references (UIDs or hashes)

  // Full attestation data
  attestation: {
    uid: string;                      // EAS UID (if submitted onchain)
    schema: string;                   // Schema UID
    attester: string;                 // Astral signer address
    recipient: string;                // Developer-specified recipient
    data: string;                     // ABI-encoded attestation data
    signature: string;                // EIP-712 signature
  };

  // For delegated onchain submission
  delegatedAttestation: {
    signature: string;                // Astral's signature for delegated attestation
    attester: string;                 // Astral's address
    deadline: number;                 // Signature expiry
  };
}
```

---

## Units and Precision

### Units

All measurements use **metric units only**:

| Measurement Type | Unit | Notes |
|------------------|------|-------|
| Distance | meters | Includes radius for `within` |
| Length | meters | |
| Area | square meters | |

No unit conversion options. Developers convert client-side if needed.

### Precision and Determinism

**Precision guarantees:**
- Distance/length: centimeter precision (rounded to nearest 0.01m)
- Area: square centimeter precision (rounded to nearest 0.0001 m²)

**Storage format:**
Results stored as scaled integers in attestations for determinism:
- `523.45 meters` → `52345` (centimeters as uint256)
- `1234.5678 m²` → `12345678` (cm² as uint256)

**Determinism:**
- Same inputs produce same outputs within a single service instance
- PostGIS floating point operations rounded to defined precision before signing
- Cross-instance determinism relies on consistent rounding, not bit-exact floating point

---

## API Design

### Base URL

```
https://api.astral.global/compute/v0
```

### Endpoints

#### POST /compute/distance

Compute distance between two geometries.

**Request:**
```json
{
  "from": "0xabc123...",
  "to": { "type": "Point", "coordinates": [2.2945, 48.8584] },
  "schema": "0xschema...",
  "recipient": "0xdef456..."
}
```

**Parameters:**

| Field | Required | Description |
|-------|----------|-------------|
| `from` | Yes | First geometry (see Input Types) |
| `to` | Yes | Second geometry (see Input Types) |
| `schema` | Yes | EAS schema UID to issue attestation against |
| `recipient` | No | Attestation recipient address |

Each geometry input can be:
- A UID string (onchain attestation — fetched from EAS)
- A GeoJSON geometry object (raw, unsigned)
- `{ uid, uri }` for offchain attestations (UID verifies content)
- `{ attestation: {...} }` for inline offchain attestations

**Response:**
```json
{
  "result": 523.45,
  "units": "meters",
  "operation": "distance",
  "timestamp": 1706400000,
  "inputRefs": [
    "0xabc123...",
    "0x7d3e8f..."
  ],
  "attestation": {
    "schema": "0x...",
    "attester": "0x...",
    "recipient": "0xdef456...",
    "data": "0x...",
    "signature": "0x..."
  },
  "delegatedAttestation": {
    "signature": "0x...",
    "attester": "0x...",
    "deadline": 1706403600
  }
}
```

#### POST /compute/contains

Check if a geometry is inside a container geometry.

**Request:**
```json
{
  "container": "0xpolygon...",
  "geometry": "0xpoint...",
  "schema": "0xschema...",
  "recipient": "0xdef456..."
}
```

**Response:**
```json
{
  "result": true,
  "operation": "contains",
  "timestamp": 1706400000,
  "inputRefs": ["0xpolygon...", "0xpoint..."],
  "attestation": { ... },
  "delegatedAttestation": { ... }
}
```

#### POST /compute/within

Check if a geometry is within a radius of a target.

**Request:**
```json
{
  "geometry": "0xpoint...",
  "target": "0xlandmark...",
  "radius": 500,
  "schema": "0xschema...",
  "recipient": "0xdef456..."
}
```

**Note:** Radius is always in meters.

#### POST /compute/intersects

Check if two geometries intersect.

**Request:**
```json
{
  "geometry1": "0xpolygon1...",
  "geometry2": "0xpolygon2...",
  "schema": "0xschema...",
  "recipient": "0xdef456..."
}
```

#### POST /compute/area

Calculate area of a polygon.

**Request:**
```json
{
  "geometry": "0xpolygon...",
  "schema": "0xschema...",
  "recipient": "0xdef456..."
}
```

#### POST /compute/length

Calculate length of a line.

**Request:**
```json
{
  "geometry": "0xline...",
  "schema": "0xschema...",
  "recipient": "0xdef456..."
}
```

---

## SDK Design

The Astral SDK (`@decentralized-geo/astral-sdk`) is the client library developers use. The `compute` namespace is an **extension** that wraps HTTP calls to the compute service API.

```
Developer App → Astral SDK (compute.*) → HTTP → Compute Service → EAS SDK (signing)
```

The compute service uses `@ethereum-attestation-service/eas-sdk` internally for attestation signing. Developers don't interact with EAS SDK directly for compute operations.

### Initialization

```typescript
import { AstralSDK } from '@decentralized-geo/astral-sdk';
import { ethers } from 'ethers';

// Basic initialization
const astral = new AstralSDK({
  chainId: 84532,                         // Required: all subsequent operations scoped to this chain
  apiUrl: 'https://api.astral.global',    // Optional, has default
});

// With signer (for authenticated requests, future phases)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const astral = new AstralSDK({
  chainId: 84532,
  signer: wallet,
});
```

**Chain Scope:** All input UIDs must exist on the configured chain. Policy Attestations are signed for that chain's EAS deployment. Cross-chain operations are not supported in MVP.

### Namespace Structure

```typescript
class AstralSDK {
  // Location attestation operations (existing)
  location: {
    create(geojson: GeoJSON, options?: CreateOptions): Promise<LocationAttestation>;
    get(uid: string): Promise<LocationAttestation>;
    query(filters: QueryFilters): Promise<LocationAttestation[]>;
  };

  // Geospatial computation operations (this spec)
  compute: {
    distance(input1: Input, input2: Input, options?: ComputeOptions): Promise<NumericPolicyAttestation>;
    area(input: Input, options?: ComputeOptions): Promise<NumericPolicyAttestation>;
    length(input: Input, options?: ComputeOptions): Promise<NumericPolicyAttestation>;
    contains(container: Input, containee: Input, options?: ComputeOptions): Promise<BooleanPolicyAttestation>;
    within(point: Input, target: Input, radius: number, options?: ComputeOptions): Promise<BooleanPolicyAttestation>;
    intersects(geom1: Input, geom2: Input, options?: ComputeOptions): Promise<BooleanPolicyAttestation>;
  };

  // EAS submission helpers
  eas: {
    submitDelegated(attestation: PolicyAttestation): Promise<TransactionReceipt>;
  };
}
```

### Compute Options

```typescript
interface ComputeOptions {
  schema: string;         // EAS schema UID (required)
  recipient?: string;     // Attestation recipient
}
```

**Note:** `schema` is required — it determines which resolver the attestation can be submitted to. Units are fixed to metric. Chain is set at SDK initialization.

### Usage Examples

```typescript
// Check if user is within 500m of landmark
const nearby = await astral.compute.within(
  userLocationUID,
  landmarkUID,
  500,  // meters
  {
    schema: MY_RESOLVER_SCHEMA,
    recipient: userAddress
  }
);

console.log(`Nearby: ${nearby.result}`);

if (nearby.result) {
  // Submit onchain for resolver to process
  const tx = await astral.eas.submitDelegated(nearby.delegatedAttestation);
}

// Using raw GeoJSON for reference geometry
const result = await astral.compute.contains(
  { type: 'Polygon', coordinates: [...] },  // Region boundary (raw)
  userLocationUID,                           // User's attested location
  { schema: GEOFENCE_SCHEMA }
);
```

---

## Authentication

### Phased Approach

#### Phase 1: No Auth (MVP)

- No authentication required
- Rate limiting by IP address
- Suitable for local development and initial testing

```typescript
const astral = new AstralSDK(); // Works without signer
```

#### Phase 2: Wallet Auth

- Requests signed by developer's wallet
- Rate limiting by wallet address
- Better limits for authenticated requests

```typescript
const astral = new AstralSDK({ signer: wallet });
// SDK auto-signs requests
```

#### Phase 3: Optional Tiered Auth

- Public access with conservative limits
- Authenticated access with higher limits
- Foundation for paid tiers, staking, etc.

### Implementation Notes

- SDK always accepts optional `signer` parameter
- Service middleware supports configurable auth requirements
- Rate limiter keys by wallet address (if authenticated) or IP (if not)

---

## Onchain Integration

### Delegated Attestations

EAS supports delegated attestations where:
1. Astral signs the attestation data offchain
2. Developer submits with Astral's signature
3. EAS verifies signature and records Astral as attester
4. Developer pays gas

```typescript
// Get policy attestation from Astral
const policy = await astral.compute.within(userUID, landmarkUID, 500);

// Submit onchain (developer pays gas, Astral is attester)
const tx = await astral.eas.submitDelegated(policy.delegatedAttestation);
// attestation.attester == Astral's address ✓
```

### Resolver Contract Pattern

```solidity
contract LocationGatedAction is SchemaResolver {
    address public astralSigner;  // Updateable via multisig

    function onAttest(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal override returns (bool) {
        // 1. Verify from Astral
        require(attestation.attester == astralSigner, "Not from Astral");

        // 2. Decode policy result (BooleanPolicyAttestation)
        (bool result, , , ) = abi.decode(
            attestation.data,
            (bool, bytes32[], uint64, string)
        );

        // 3. Execute business logic
        require(result, "Policy check failed");
        _executeAction(attestation.recipient);

        return true;
    }

    // Multisig-controlled signer update for key rotation
    function updateAstralSigner(address newSigner) external onlyMultisig {
        astralSigner = newSigner;
    }
}
```

### Submission Options

1. **Offchain only (default):** Get signed attestation, use in app
2. **Developer submits:** Use `astral.eas.submitDelegated()` with their wallet
3. **Astral submits (future):** Rate-limited sponsored submission for demos

---

## Input Handling

### UID Resolution

When a UID is provided as input:

1. **Check local attestation:** If service has attestation data, use it
2. **Fetch from EAS:** Query EAS contracts using chainId
3. **Verify signature:** For offchain attestations, verify EIP-712 signature
4. **Extract geometry:** Decode Location Protocol data, extract geometry

For onchain attestations, signature verification is not needed (EAS already validated).

### Raw GeoJSON

Raw GeoJSON is accepted for maximum flexibility:
- Geometry is used directly for computation
- A `keccak256` hash of the geometry is recorded in `inputRefs`
- No verification of the geometry's authenticity

**Trust model:** The Policy Attestation proves "Astral computed relationship Z between inputs A and B." For raw GeoJSON, it does NOT prove where those geometries came from. The hash enables verification that a specific geometry was used, if the original is known.

**Use cases for raw inputs:**
- Reference geometries (official boundaries, landmarks)
- Ephemeral data (GPS readings that don't need to be persisted)
- Prototyping before creating formal attestations
- Both inputs can be raw — the service provides onchain-usable signed results regardless

### Offchain Attestations

Offchain attestations are not stored on EAS contracts, so a bare UID cannot be resolved. Two options:

```typescript
// Option 1: Full attestation object (inline)
astral.compute.distance(
  { attestation: signedOffchainAttestation },
  uid2,
  { schema: SCHEMA_UID }
);

// Option 2: UID + URI (preferred for large attestations)
astral.compute.distance(
  {
    uid: '0xabc...',           // Expected UID (acts as checksum)
    uri: 'ipfs://Qm...'        // Where to fetch (IPFS preferred)
  },
  uid2,
  { schema: SCHEMA_UID }
);

// HTTPS URLs are allowed but less secure
{
  uid: '0xabc...',
  uri: 'https://example.com/attestation.json'
}
```

**Resolution process for `{ uid, uri }`:**
1. Fetch attestation from URI
2. Verify fetched attestation's UID matches declared UID
3. Verify EIP-712 signature
4. Extract geometry

The UID acts as a checksum — even non-content-addressed URLs are secure because we verify the content matches the declared UID.

### Coordinate System

Honors the `srs` field from Location Protocol. Defaults to WGS84 (EPSG:4326) for raw GeoJSON.

---

## Error Handling

### Error Format

Follows RFC 7807 Problem+JSON, consistent with existing Astral API.

```json
{
  "type": "https://api.astral.global/errors/attestation-not-found",
  "title": "Attestation Not Found",
  "status": 404,
  "detail": "Location attestation with UID 0xabc123... not found on chain 84532"
}
```

### Error Types

| Type | Status | Description |
|------|--------|-------------|
| `invalid-input` | 400 | Bad request data, missing fields, invalid geometry |
| `attestation-not-found` | 404 | UID doesn't exist on specified chain |
| `verification-failed` | 401 | Signature verification failed |
| `computation-error` | 500 | PostGIS operation failed |
| `rate-limited` | 429 | Too many requests |

---

## Tech Stack

### Compute Service

- **Runtime:** Node.js + TypeScript
- **Framework:** Express or Fastify
- **Database:** PostgreSQL + PostGIS (in-container)
- **Signing:** ethers.js
- **EAS:** @ethereum-attestation-service/eas-sdk

### Why This Stack

- **TypeScript:** Matches SDK, familiar to web3 devs, good ethers.js support
- **PostGIS:** Gold standard for geospatial operations, 20+ years mature
- **In-container DB:** Required for verifiable computation in TEE

### Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.11.0",
    "ethers": "^6.0.0",
    "@ethereum-attestation-service/eas-sdk": "^1.0.0"
  }
}
```

---

## Deployment

### Local Development

Docker Compose for local development:

```yaml
version: '3.8'
services:
  compute:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/astral
      - SIGNER_PRIVATE_KEY=${SIGNER_PRIVATE_KEY}
    depends_on:
      - db

  db:
    image: postgis/postgis:15-3.3
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=astral
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### EigenCompute Deployment

1. Build Docker image with service + PostGIS
2. Upload to EigenCompute via CLI
3. Image runs in TEE environment
4. EigenCompute handles attestation and verification

### Observability

- **Structured Logging:** JSON logs with request IDs, timing, operation details
- **Log Fields:** `requestId`, `operation`, `inputTypes`, `durationMs`, `resultType`
- **Ready for:** Log aggregation (Datadog, CloudWatch, etc.)

---

## Security Considerations

### Trust Model (MVP)

- Centralized service with known signer
- Deterministic operations (same inputs → same outputs)
- TEE provides execution attestation
- **Future:** Decentralize via AVS consensus, ZK proofs

### Known Considerations

#### Replay Attacks

**Status:** ⚠️ Documented, resolver responsibility

Policy Attestations can potentially be reused:
- **Temporal replay:** Old attestation used for current benefit
- **Cross-context replay:** Attestation for one resolver used at another

**Mitigations (resolver's responsibility):**
- Track used attestation UIDs
- Check timestamp freshness
- Bind to specific use case in resolver logic

**Future consideration:** Evaluate whether nonce or additional binding fields should be added to schema.

#### Input Trust

- Raw GeoJSON inputs are not verified for authenticity
- This is documented and configurable for future phases
- For verified inputs, use Location Attestation UIDs

#### Key Management

- MVP uses simple signer key
- Key stored in TEE environment
- Resolver contracts should have multisig-updateable signer address for rotation

### Audit Checklist (Pre-Production)

- [ ] Replay attack analysis
- [ ] Rate limiting effectiveness
- [ ] Input validation completeness
- [ ] Signature verification coverage
- [ ] Key rotation procedures

---

## Open Questions

### Deferred Decisions

1. **Reference Data Caching:** Start stateless. Add baked reference geometries (countries, etc.) if performance requires.

2. **Gas Sponsorship:** MVP uses delegated attestations (developer pays). Astral-sponsored option for demos TBD.

3. **Complex Geometry Limits:** No hard limits for MVP. Add based on observed usage patterns.

4. **Verification Integration:** Compute service is compute-only for MVP. Location proof verification is separate workstream.

### Research Needed

1. **Nonce/Replay Protection:** Should Policy Attestations include explicit nonce or binding fields? Current design relies on unique UIDs + timestamps.

2. **EigenCompute Networking:** Verify TEE allows outbound network for EAS contract queries.

3. **PostGIS in TEE:** Validate PostGIS performance characteristics in TEE environment.

---

## Appendix: Grant Milestone Mapping

### Milestone One: MVP + EigenCloud Integration

| Requirement | Spec Coverage |
|-------------|---------------|
| MVP integrating with EigenCloud | ✅ Architecture, EigenCloud Integration section |
| GitHub repo access | ✅ This repo |
| X announcement | Marketing deliverable |

### Milestone Two: Internal Demo

| Requirement | Spec Coverage |
|-------------|---------------|
| Video walkthrough | Implementation + recording |

### Milestone Three: Final Product

| Requirement | Spec Coverage |
|-------------|---------------|
| Architecture diagram | ✅ Architecture section |
| X article | Marketing deliverable |

---

## Changelog

- **0.1.0** (2025-01-27): Initial draft from design interview
