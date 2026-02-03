---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, data-integrity, architecture]
dependencies: []
---

# Within Operation: Radius Not Included in Attestation

## Problem Statement

The `within` operation takes a `radius` parameter that determines the geofence distance, but this parameter is not included in the attestation data. An attestation claiming "point is within target" is meaningless without knowing the radius used.

**Why it matters:** Verifiers cannot determine what radius was used for the computation. The same point/target pair could be within at 1000m but not within at 100m.

## Findings

### Source
- Data Integrity Guardian Agent

### Evidence/Location

File: `packages/compute-service/src/routes/within.ts`

Lines 51-58:
```typescript
const attestation = await signBooleanAttestation(
  {
    result,
    inputRefs: [pointResolved.ref, targetResolved.ref],  // radius NOT here
    timestamp,
    operation: 'within',
  },
  schema,
  recipient
);
```

### Impact

- Attestation is semantically incomplete
- Cannot verify what radius was used
- Different radius values produce indistinguishable attestations

## Proposed Solutions

### Option A: Include Radius Hash in InputRefs (Recommended)
```typescript
const radiusRef = keccak256(toUtf8Bytes(radius.toString()));
inputRefs: [pointResolved.ref, targetResolved.ref, radiusRef],
```

**Pros:** Simple, uses existing inputRefs mechanism
**Cons:** Radius must be known to verify
**Effort:** Small
**Risk:** Low

### Option B: Create Dedicated Schema for Within
Create a new schema that includes radius as explicit field:
```solidity
// Schema: "bool result, uint256 radiusMeters, bytes32[] inputRefs, uint256 timestamp, string operation"
```

**Pros:** Radius is explicit and readable
**Cons:** New schema to register, breaking change
**Effort:** Medium
**Risk:** Medium

### Option C: Document Limitation
Document that radius is not included and callers must track it separately.

**Pros:** No code change
**Cons:** Poor DX, semantic gap remains
**Effort:** Minimal
**Risk:** Low

## Recommended Action

Option A for MVP - include radius hash in inputRefs. Consider Option B for future version with proper schema.

## Technical Details

### Affected Files
- `packages/compute-service/src/routes/within.ts`
- `packages/compute-service/src/services/input-resolver.ts` (may need helper)

## Acceptance Criteria

- [ ] Radius value contributes to attestation uniqueness
- [ ] Different radii produce different inputRefs
- [ ] Document how to verify radius from attestation

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Semantic completeness for attestations |

## Resources

- SPEC.md Section 5: Data Models (inputRefs definition)
