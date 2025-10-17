# Technical Design: Astral Location Services

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Developer Application                                    │
│  - Collects user location                                │
│  - Calls Astral SDK                                       │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Astral SDK (@astral-protocol/sdk)                       │
│  - sdk.location.* (create, get, query attestations)      │
│  - sdk.compute.* (distance, contains, intersects, etc.)  │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Astral API (api.astral.global)                          │
│                                                           │
│  /locations/*     → Indexer Service (existing)           │
│  /compute/*       → Compute Service (new)                │
└──────┬───────────────────────────────────┬───────────────┘
       │                                   │
       │                                   │
       ▼                                   ▼
┌─────────────────┐              ┌──────────────────────┐
│  Indexer        │              │  Compute Service     │
│  Service        │              │  (Policy Engine)     │
│                 │              │                      │
│  - Syncs EAS    │              │  - Reads location    │
│  - Writes to DB │              │    attestations      │
│  - OGC Features │              │  - Executes PostGIS  │
└────────┬────────┘              │  - Signs results     │
         │                       │  - Returns Policy    │
         │                       │    Attestations      │
         │                       └──────────┬───────────┘
         │                                  │
         ▼                                  │
┌──────────────────────────────────────────┴───────────────┐
│  Shared Postgres Database                                │
│  - Location attestations (PostGIS-enabled)               │
│  - Indexed by UID, geometry, tags, etc.                  │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Ethereum (EAS Contracts)                                │
│  - Location attestations (onchain)                       │
│  - Policy attestations (onchain)                         │
│  - Resolver contracts (business logic)                   │
└──────────────────────────────────────────────────────────┘
```

---

## System Components

### 1. Astral SDK

**Responsibility:** Developer-facing interface for all Astral operations

**Namespaces:**
```typescript
sdk.location.*   // Location attestation operations
sdk.compute.*    // Geospatial computation operations
```

**Key Methods:**
```typescript
// Location attestations
sdk.location.create(geojson, options?)    // → LocationAttestation
sdk.location.get(uid)                     // → LocationAttestation
sdk.location.query(filters)               // → LocationAttestation[]

// Geospatial computations (returns Policy Attestations)
sdk.compute.distance(input1, input2, options?)
sdk.compute.contains(container, point, options?)
sdk.compute.intersects(geom1, geom2, options?)
sdk.compute.within(point, target, radius, options?)
sdk.compute.buffer(input, radius, options?)
sdk.compute.area(input, options?)
```

**Input Flexibility:**
- UIDs (primary): `"0xabc123..."`
- GeoJSON: `{ type: 'Point', coordinates: [...] }`
- GeoJSON Features: `{ type: 'Feature', geometry: {...} }`

---

### 2. API Gateway

**Responsibility:** Route requests to appropriate services

**Endpoints:**

**Location operations** (existing):
- `GET /locations/:uid` - Fetch location attestation
- `GET /locations` - Query location attestations (OGC Features compliant)
- `POST /locations` - Create location attestation

**Compute operations** (new):
- `POST /compute/distance` - Compute distance between two locations
- `POST /compute/contains` - Check if point is in polygon
- `POST /compute/intersects` - Check if geometries intersect
- `POST /compute/within` - Check if point is within radius of target
- `POST /compute/buffer` - Create buffer around geometry
- `POST /compute/area` - Calculate area of polygon

**Request Format:**
```json
{
  "inputs": [
    { "type": "uid", "value": "0xabc123..." },
    { "type": "geojson", "value": { "type": "Point", ... } }
  ],
  "options": {
    "units": "meters",
    "submitOnchain": false,
    "schema": "0x...",
    "recipient": "0x..."
  }
}
```

---

### 3. Compute Service (Policy Engine)

**Responsibility:** Execute geospatial computations and sign results

**Process Flow:**
1. Receive computation request
2. Resolve inputs (fetch UIDs from DB if needed)
3. Extract geometries from attestations
4. Execute PostGIS operation
5. Create Policy Attestation with result
6. Sign attestation with service key
7. Optionally submit to EAS onchain
8. Return Policy Attestation

**Technology:**
- Language: TypeScript/Node.js or Python
- Database: PostGIS (shared with indexer)
- Signing: ethers.js with service private key
- EAS: @ethereum-attestation-service/eas-sdk

**Key Considerations:**
- Rate limiting (prevent abuse)
- Cost estimation (complex operations)
- Operation timeout (bounded execution)
- Deterministic results (same inputs → same outputs)

---

### 4. Shared Database

**Responsibility:** Store and index location attestations

**Schema:**
```sql
CREATE TABLE location_attestations (
    uid VARCHAR(66) PRIMARY KEY,
    attester VARCHAR(42) NOT NULL,
    recipient VARCHAR(42),
    schema VARCHAR(66) NOT NULL,
    geometry GEOMETRY(Geometry, 4326) NOT NULL,  -- PostGIS
    location_type VARCHAR(50),
    srs VARCHAR(100),
    spec_version VARCHAR(10),
    metadata JSONB,
    timestamp TIMESTAMP NOT NULL,
    chain_id INTEGER,
    is_onchain BOOLEAN DEFAULT false,
    raw_data JSONB NOT NULL,

    -- PostGIS spatial index
    SPATIAL INDEX(geometry)
);
```

**Indexer writes, compute service reads.**

---

## Data Models

### Location Attestation

**Schema (Location Protocol conformant):**
```typescript
{
  srs: string;              // e.g., "EPSG:4326"
  locationType: string;     // e.g., "geojson"
  location: GeoJSON;        // The actual geometry
  specVersion: string;      // e.g., "1.0"
  metadata?: object;        // Optional additional data
}
```

**EAS Attestation wrapper:**
```typescript
{
  uid: string;              // Unique identifier
  schema: string;           // Location Protocol schema UID
  attester: string;         // Who created it
  recipient: string;        // Who it's about (optional)
  time: number;             // Timestamp
  expirationTime: number;
  revocationTime: number;
  refUID: string;           // Reference to another attestation
  data: bytes;              // ABI-encoded Location Protocol data
  signature?: bytes;        // Offchain signature (if offchain)
}
```

---

### Policy Attestation

**Purpose:** Signed result of a geospatial computation

**Schema Design (to be finalized):**

**Option 1: Single universal schema**
```typescript
{
  operation: string;        // e.g., "distance", "contains"
  inputs: string[];         // UIDs or geometry hashes
  result: bytes;            // Encoded result (type varies by operation)
  resultType: string;       // "boolean", "number", "geometry"
  units?: string;           // For measurements: "meters", "kilometers"
  timestamp: number;
  metadata?: object;
}
```

**Option 2: Separate schemas by result type**
- `PolicyAttestationBoolean` (contains, intersects, within)
- `PolicyAttestationNumeric` (distance, area, length)
- `PolicyAttestationGeometry` (buffer, union, intersection)

**EAS Attestation wrapper:** Same structure as Location Attestation

**Attester:** Astral's service signing key (known, trusted address)

---

## SDK Architecture

### Namespace Structure

```typescript
class AstralSDK {
  constructor(config: {
    signer?: Signer;
    apiUrl?: string;
    easAddress?: string;
  });

  // Location attestation operations
  location: {
    create(geojson: GeoJSON, options?: CreateOptions): Promise<LocationAttestation>;
    get(uid: string): Promise<LocationAttestation>;
    query(filters: QueryFilters): Promise<LocationAttestation[]>;
  };

  // Geospatial computation operations
  compute: {
    distance(input1: Input, input2: Input, options?: ComputeOptions): Promise<PolicyAttestation>;
    contains(container: Input, point: Input, options?: ComputeOptions): Promise<PolicyAttestation>;
    intersects(geom1: Input, geom2: Input, options?: ComputeOptions): Promise<PolicyAttestation>;
    within(point: Input, target: Input, radius: number, options?: ComputeOptions): Promise<PolicyAttestation>;
    buffer(input: Input, radius: number, options?: ComputeOptions): Promise<PolicyAttestation>;
    area(input: Input, options?: ComputeOptions): Promise<PolicyAttestation>;
  };
}

type Input = string | GeoJSON | Feature;

interface ComputeOptions {
  units?: 'meters' | 'kilometers' | 'miles';
  submitOnchain?: boolean;
  chainId?: number;
  schema?: string;
  recipient?: string;
}
```

---

## Core Operations (MVP)

### Measurements (return numbers)
- `distance(input1, input2)` - Distance between two geometries
- `area(polygon)` - Area of a polygon
- `length(line)` - Length of a line

### Boolean Predicates (return true/false)
- `contains(container, containee)` - Is geometry inside another?
- `intersects(geom1, geom2)` - Do geometries overlap?
- `within(point, target, radius)` - Is point within distance of target?
- `disjoint(geom1, geom2)` - Do geometries not touch?

### Transformations (return geometries)
- `buffer(geometry, radius)` - Create buffer zone around geometry
- `centroid(geometry)` - Find center point
- `envelope(geometry)` - Bounding box
- `union(geom1, geom2)` - Merge geometries
- `intersection(geom1, geom2)` - Overlapping area

**These map to PostGIS functions:**
- `ST_Distance`
- `ST_Area`
- `ST_Length`
- `ST_Contains`
- `ST_Intersects`
- `ST_DWithin`
- `ST_Buffer`
- `ST_Centroid`
- etc.

---

## Integration Patterns

### Pattern 1: Offchain Verification

```typescript
// Create location attestation
const myLocation = await sdk.location.create(userGPS);

// Compute with signature
const result = await sdk.compute.distance(myLocation.uid, targetUID);

// Use offchain (in app)
if (result.result < 500) {
  showNearbyContent();
}
```

### Pattern 2: Onchain Submission (Manual)

```typescript
const result = await sdk.compute.contains(regionUID, pointUID);

// Developer submits to EAS
const tx = await eas.attest({
  schema: MY_SCHEMA,
  data: {
    policyResult: result.result,
    inputs: [regionUID, pointUID]
  }
});
```

### Pattern 3: Onchain Submission (Automatic)

```typescript
const result = await sdk.compute.within(pointUID, targetUID, 500, {
  submitOnchain: true,
  schema: MY_SCHEMA,
  recipient: userAddress
});

// SDK submits to EAS for you
// Returns attestation UID
```

### Pattern 4: EAS Resolver Integration

```solidity
// Resolver contract
contract LocationGatedMint is SchemaResolver {
    address public astralSigner;

    function onAttest(Attestation calldata attestation, uint256)
        internal override returns (bool) {
        // Only accept from Astral
        require(attestation.attester == astralSigner);

        // Decode policy result
        (bool isInRegion) = abi.decode(attestation.data, (bool));
        require(isInRegion, "Not in allowed region");

        // Execute business logic
        _mint(attestation.recipient, tokenId);

        return true;
    }
}
```

```typescript
// Client code
const result = await sdk.compute.contains(regionUID, userLocationUID, {
  submitOnchain: true,
  schema: LOCATION_GATED_SCHEMA,  // Has resolver attached
  recipient: userAddress
});

// EAS calls resolver → resolver mints → attestation created
```

---

## Open Design Questions

1. **Policy Attestation Schema**: Single schema or multiple? How to encode different result types?
2. **Rate Limiting**: Per-address? Per-operation? Cost-based?
3. **Error Handling**: How to handle failed operations? Partial results?
4. **Caching**: Should repeated computations return cached results?
5. **Versioning**: How to handle schema/operation upgrades?
6. **Offchain Storage**: IPFS for large geometries? Or always onchain?

---

## Future Enhancements

**Predicate Evaluation** (v2):
```typescript
sdk.policy.evaluate({
  point: userLocationUID,
  predicate: {
    type: 'and',
    conditions: [
      { type: 'within', target: region1UID, distance: 500 },
      { type: 'outside', target: region2UID, distance: 1000 }
    ]
  }
});
```

**Decentralized Verification**:
- AVS integration (EigenLayer)
- ZK proofs of computation
- TEE execution
- Multi-party computation

**Query Integration**:
```typescript
sdk.policy.evaluate({
  point: userLocationUID,
  predicate: {
    type: 'within',
    target: { query: { tags: ['coffee-shop'], limit: 10 } },
    distance: 500
  }
});
// "Is user within 500m of any of the 10 nearest coffee shops?"
```
