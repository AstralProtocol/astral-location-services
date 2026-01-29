# Implementation Plan: Docs-Code Alignment

This plan aligns the codebase with the mintlify-docs specification.

## Decisions Made

| Decision | Choice |
|----------|--------|
| Response format | Flat structure |
| ChainId in requests | Yes, explicit in all requests |
| API URL | `api.astral.global/compute/v0/*` |
| SDK merge | Deferred, add note to docs |
| `recipient` | Optional, defaults to zero address |

---

## Phase 1: API Response Format (compute-service)

### Task 1.1: Define New Response Types

**File:** `packages/compute-service/src/types/index.ts`

**Changes:**
- Create new flat response interfaces matching docs
- Add serialization helpers

```typescript
// New flat response format
export interface NumericComputeResponse {
  result: number;                    // e.g., 523.45
  units: string;                     // "meters" | "square_meters"
  operation: string;                 // "distance" | "area" | "length"
  timestamp: number;                 // Unix timestamp
  inputRefs: string[];               // ["0x...", "0x..."]
  attestation: {
    schema: string;
    attester: string;
    recipient: string;
    data: string;
    signature: string;
  };
  delegatedAttestation: {
    signature: string;
    attester: string;
    deadline: number;
  };
}

export interface BooleanComputeResponse {
  result: boolean;                   // true | false
  operation: string;                 // "contains" | "within" | "intersects"
  timestamp: number;
  inputRefs: string[];
  attestation: { ... };
  delegatedAttestation: { ... };
}
```

### Task 1.2: Update Signing Module to Return Split Attestation

**File:** `packages/compute-service/src/signing/attestation.ts`

**Changes:**
- Return both `attestation` (for verification) and `delegatedAttestation` (for submission) separately
- Include `deadline` in delegatedAttestation

### Task 1.3: Update All Route Handlers

**Files:**
- `packages/compute-service/src/routes/distance.ts`
- `packages/compute-service/src/routes/area.ts`
- `packages/compute-service/src/routes/length.ts`
- `packages/compute-service/src/routes/contains.ts`
- `packages/compute-service/src/routes/within.ts`
- `packages/compute-service/src/routes/intersects.ts`

**Changes for each:**
1. Add `chainId` to request schema (required number)
2. Make `recipient` optional with default `0x0000000000000000000000000000000000000000`
3. Return flat response structure
4. Include `operation` and `timestamp` in response

**Example for distance.ts:**
```typescript
const DistanceRequestSchema = z.object({
  chainId: z.number().int().positive(),  // NEW
  from: InputSchema,
  to: InputSchema,
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
    .default('0x0000000000000000000000000000000000000000'),  // CHANGED
});

// Response construction
const response: NumericComputeResponse = {
  result: distanceMeters,
  units: 'meters',
  operation: 'distance',
  timestamp: Math.floor(Date.now() / 1000),
  inputRefs: [fromResolved.ref, toResolved.ref],
  attestation: { schema, attester, recipient, data, signature },
  delegatedAttestation: { signature, attester, deadline },
};
```

### Task 1.4: Rename `within` Parameter

**File:** `packages/compute-service/src/routes/within.ts`

**Change:** Rename `point` to `geometry` in request schema to match docs.

```typescript
// Before
const WithinRequestSchema = z.object({
  point: InputSchema,
  target: InputSchema,
  ...
});

// After
const WithinRequestSchema = z.object({
  geometry: InputSchema,  // Changed from 'point'
  target: InputSchema,
  ...
});
```

---

## Phase 2: API Versioning & Rate Limiting

### Task 2.1: Add Version Prefix to Routes

**File:** `packages/compute-service/src/index.ts`

**Change:** Mount routes at `/compute/v0` instead of `/compute`

```typescript
// Before
app.use('/compute', computeRoutes);

// After
app.use('/compute/v0', computeRoutes);
```

### Task 2.2: Update Rate Limiting

**File:** `packages/compute-service/src/middleware/rate-limit.ts`

**Change:** 100 requests per hour (not per minute)

```typescript
// Before
windowMs: 60 * 1000,  // 1 minute
max: 100,

// After
windowMs: 60 * 60 * 1000,  // 1 hour
max: 100,
```

---

## Phase 3: SDK Updates (sdk-extensions)

### Task 3.1: Update SDK Types

**File:** `packages/sdk-extensions/src/types.ts`

**Changes:**
1. Make `recipient` optional in `ComputeOptions`
2. Update response types to match new flat format
3. Add support for direct UID string input

```typescript
export interface ComputeOptions {
  schema: string;
  recipient?: string;  // Now optional
}

// Support direct UID string
export type Input =
  | string                    // Direct UID: "0xabc..."
  | RawGeometryInput          // GeoJSON Geometry
  | GeoJSON.Feature           // GeoJSON Feature (extract geometry)
  | OnchainInput              // { uid: string }
  | OffchainInput;            // { uid: string, uri: string }

// New flat response types
export interface NumericComputeResult {
  result: number;
  units: string;
  operation: string;
  timestamp: number;
  inputRefs: string[];
  attestation: AttestationObject;
  delegatedAttestation: DelegatedAttestationObject;
}

export interface BooleanComputeResult {
  result: boolean;
  operation: string;
  timestamp: number;
  inputRefs: string[];
  attestation: AttestationObject;
  delegatedAttestation: DelegatedAttestationObject;
}
```

### Task 3.2: Update SDK Compute Client

**File:** `packages/sdk-extensions/src/compute.ts`

**Changes:**
1. Update default `apiUrl` to `https://api.astral.global`
2. Include `chainId` in request body
3. Handle direct UID string inputs
4. Extract geometry from GeoJSON Features
5. Rename `point` to `geometry` for `within()` method

```typescript
export class AstralCompute {
  constructor(config: AstralComputeConfig) {
    this.apiUrl = config.apiUrl?.replace(/\/$/, '') ?? 'https://api.astral.global';
    this.chainId = config.chainId;
  }

  async within(
    geometry: Input,  // Renamed from 'point'
    target: Input,
    radius: number,
    options: ComputeOptions
  ): Promise<BooleanComputeResult> {
    return this.request('/compute/v0/within', {
      chainId: this.chainId,
      geometry: this.normalizeInput(geometry),  // Renamed
      target: this.normalizeInput(target),
      radius,
      schema: options.schema,
      recipient: options.recipient,
    });
  }

  // Helper to normalize inputs
  private normalizeInput(input: Input): object {
    // Direct UID string
    if (typeof input === 'string') {
      return { uid: input };
    }
    // GeoJSON Feature - extract geometry
    if ('type' in input && input.type === 'Feature') {
      return input.geometry;
    }
    // Pass through as-is
    return input;
  }
}
```

### Task 3.3: Add estimateGas to EAS Helper

**File:** `packages/sdk-extensions/src/eas.ts`

**Add:**
```typescript
async estimateGas(attestation: DelegatedAttestation): Promise<bigint> {
  // Estimate gas for submitDelegated
  const { message, signature, attester } = attestation;

  const gasEstimate = await this.eas.estimateGas.attestByDelegation({
    schema: message.schema,
    data: {
      recipient: message.recipient,
      expirationTime: message.expirationTime,
      revocable: message.revocable,
      refUID: message.refUID,
      data: message.data,
      value: message.value,
    },
    signature: {
      v: signature.v,
      r: signature.r,
      s: signature.s,
    },
    attester,
    deadline: message.deadline,
  });

  return gasEstimate;
}
```

---

## Phase 4: Documentation Updates (mintlify-docs)

### Task 4.1: Update SDK Overview

**File:** `../mintlify-docs/sdk/overview.mdx`

**Changes:**
1. Show two-SDK approach (astral-sdk + astral-compute)
2. Add note about planned merge
3. Remove unified `AstralClient` references
4. Update code examples

### Task 4.2: Update SDK Installation

**File:** `../mintlify-docs/sdk/installation.mdx`

**Changes:**
1. Show both package installations
2. Explain when to use which

### Task 4.3: Update SDK Compute Page

**File:** `../mintlify-docs/sdk/compute.mdx`

**Changes:**
1. Update import statements
2. Update code examples to use `AstralCompute`
3. Update return type examples to flat format

### Task 4.4: Update SDK Location Page

**File:** `../mintlify-docs/sdk/location.mdx`

**Changes:**
1. Point to `@decentralized-geo/astral-sdk` package
2. Update import statements
3. Add note that this is a separate package

### Task 4.5: Update SDK EAS Page

**File:** `../mintlify-docs/sdk/eas.mdx`

**Changes:**
1. Update code examples
2. Add `estimateGas()` documentation
3. Update DelegatedAttestation structure if needed

### Task 4.6: Update API Overview

**File:** `../mintlify-docs/api-reference/overview.mdx`

**Changes:**
1. Update base URL to `https://api.astral.global/compute/v0`
2. Update response format examples
3. Add chainId to request examples

### Task 4.7: Update All API Endpoint Pages

**Files:**
- `../mintlify-docs/api-reference/distance.mdx`
- `../mintlify-docs/api-reference/area.mdx`
- `../mintlify-docs/api-reference/length.mdx`
- `../mintlify-docs/api-reference/contains.mdx`
- `../mintlify-docs/api-reference/within.mdx`
- `../mintlify-docs/api-reference/intersects.mdx`

**Changes for each:**
1. Add `chainId` parameter documentation
2. Make `recipient` show as optional
3. Update response examples to flat format
4. Update `within.mdx` parameter from `point` to `geometry`

---

## Phase 5: Refactoring & Cleanup

### Task 5.1: Extract Shared Zod Schemas

**File:** `packages/compute-service/src/schemas/request.ts` (NEW)

**Purpose:** DRY up duplicated Zod schemas across route files

```typescript
export const GeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']),
  coordinates: z.any(),
}).passthrough();

export const InputSchema = z.union([
  GeometrySchema,
  z.object({ uid: z.string() }),
  z.object({ uid: z.string(), uri: z.string().url() }),
]);

export const BaseRequestSchema = z.object({
  chainId: z.number().int().positive(),
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address')
    .optional()
    .default('0x0000000000000000000000000000000000000000'),
});
```

### Task 5.2: Add Request Body Size Limit

**File:** `packages/compute-service/src/index.ts`

**Add:**
```typescript
app.use(express.json({ limit: '1mb' }));
```

---

## Implementation Order

```
Phase 1 (API Response) ─┬─► Task 1.1 (types)
                        ├─► Task 1.2 (signing)
                        ├─► Task 1.3 (routes) ◄── depends on 1.1, 1.2
                        └─► Task 1.4 (within rename)

Phase 2 (Versioning) ───┬─► Task 2.1 (route prefix)
                        └─► Task 2.2 (rate limit)

Phase 3 (SDK) ──────────┬─► Task 3.1 (types)
                        ├─► Task 3.2 (compute) ◄── depends on 3.1
                        └─► Task 3.3 (eas)

Phase 4 (Docs) ─────────┬─► Task 4.1-4.7 (can run in parallel)

Phase 5 (Cleanup) ──────┬─► Task 5.1 (shared schemas)
                        └─► Task 5.2 (body limit)
```

---

## Testing Checklist

After implementation:

- [ ] All 6 compute endpoints return flat response format
- [ ] `chainId` is required in all requests
- [ ] `recipient` defaults to zero address when omitted
- [ ] API responds at `/compute/v0/*` paths
- [ ] Rate limiting is 100/hour
- [ ] SDK default URL is `https://api.astral.global`
- [ ] SDK `within()` uses `geometry` parameter name
- [ ] SDK handles direct UID strings
- [ ] SDK handles GeoJSON Features
- [ ] `estimateGas()` works
- [ ] Docs show two-SDK approach
- [ ] All doc code examples are updated

---

## Notes

- Each task should be a separate commit
- Run `npm run typecheck` and `npm run lint` before committing
- Update any existing tests to match new interfaces
