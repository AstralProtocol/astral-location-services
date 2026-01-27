---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, data-integrity, security, determinism]
dependencies: []
---

# Non-Deterministic JSON Hashing for Input References

## Problem Statement

The input resolver uses `JSON.stringify` with a custom replacer that only sorts top-level keys, not nested objects. This produces non-canonical JSON serialization, meaning the same logical geometry can produce different hashes (inputRefs) depending on the object's internal key ordering.

**Why it matters:** Attestations must be reproducible - the same inputs should always produce the same inputRefs for verification. Non-deterministic hashing breaks this guarantee.

## Findings

### Source
- Data Integrity Guardian Agent
- Security Sentinel Agent

### Evidence/Location

File: `packages/compute-service/src/services/input-resolver.ts`

Lines 33-36:
```typescript
function resolveRawGeometry(geometry: RawGeometryInput): ResolvedInput {
  // Canonical JSON serialization for consistent hashing
  const canonical = JSON.stringify(geometry, Object.keys(geometry).sort());
  const ref = keccak256(toUtf8Bytes(canonical));
  // ...
}
```

### Impact

```javascript
// These semantically identical inputs produce DIFFERENT hashes:
const geom1 = { type: "Point", coordinates: [1, 2], crs: "EPSG:4326" };
const geom2 = { crs: "EPSG:4326", type: "Point", coordinates: [1, 2] };
// Object.keys().sort() fixes top-level, but:
// 1. Nested objects are not sorted
// 2. Extra properties from .passthrough() vary in order
```

- Attestation verification may fail for legitimate inputs
- Replay protection using inputRefs becomes unreliable
- Cross-implementation compatibility broken

## Proposed Solutions

### Option A: Use json-canonicalize Package (Recommended)
```typescript
import canonicalize from 'json-canonicalize';

function resolveRawGeometry(geometry: RawGeometryInput): ResolvedInput {
  const canonical = canonicalize(geometry);
  const ref = keccak256(toUtf8Bytes(canonical));
  return { geometry, ref };
}
```

**Pros:** RFC 8785 compliant, handles nested objects, well-tested
**Cons:** New dependency
**Effort:** Small
**Risk:** Low

### Option B: Implement Custom Deep Sort
Recursively sort all object keys at every nesting level.

**Pros:** No new dependency
**Cons:** More code to maintain, edge cases in implementation
**Effort:** Medium
**Risk:** Medium

### Option C: Hash Only Specific Fields
Hash only `type` and `coordinates` in a defined order, ignoring extra properties.

**Pros:** Predictable, no extra properties affect hash
**Cons:** Loses ability to include CRS or other metadata in hash
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - Use `json-canonicalize` package for RFC 8785 compliant canonicalization.

## Technical Details

### Affected Files
- `packages/compute-service/src/services/input-resolver.ts`

### Related Components
- All compute endpoints depend on input resolution
- Attestation verification in resolver contracts

### Database Changes
None

## Acceptance Criteria

- [ ] Same logical geometry always produces same hash regardless of key order
- [ ] Nested objects are handled correctly
- [ ] Add tests verifying hash determinism with reordered keys

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Critical for attestation reproducibility |

## Resources

- [RFC 8785 - JSON Canonicalization Scheme](https://datatracker.ietf.org/doc/html/rfc8785)
- [json-canonicalize npm package](https://www.npmjs.com/package/json-canonicalize)
