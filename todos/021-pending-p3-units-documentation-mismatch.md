---
status: pending
priority: p3
issue_id: "021"
tags: [code-review, documentation, spec]
dependencies: []
---

# SPEC vs Implementation Units Mismatch

## Problem Statement

SPEC.md says attestation units are "meters" and "square_meters", but the implementation stores "centimeters" and "square_centimeters" in the attestation data.

**Why it matters:** Documentation should match implementation. Developers reading the spec will be confused when they decode attestations.

## Findings

### Source
- Manual code review

### Evidence/Location

SPEC.md says:
```
Results stored as integers with centimeter precision...
units: "meters" or "square_meters" (indicates base unit before scaling)
```

But `packages/compute-service/src/signing/schemas.ts`:
```typescript
export const UNITS = {
  CENTIMETERS: 'centimeters',
  SQUARE_CENTIMETERS: 'square_centimeters',
  // ...
};
```

And routes use:
```typescript
units: UNITS.CENTIMETERS,  // Not "meters"
```

### Impact
- Developer confusion
- Spec doesn't match reality

## Proposed Solutions

### Option A: Update Implementation to Match Spec (Recommended)
Change units to "meters" / "square_meters" as the spec says. The value is already scaled to centimeters as a uint256, the units field just describes the base unit.

### Option B: Update Spec to Match Implementation
Change spec to say units are "centimeters" / "square_centimeters".

## Recommended Action

Option A - the spec's design (units describe base unit, value is scaled) makes more sense.

## Technical Details

### Affected Files
- `packages/compute-service/src/signing/schemas.ts`
- `packages/compute-service/src/routes/*.ts`

## Acceptance Criteria

- [ ] SPEC.md and implementation agree on units field values
- [ ] Units field accurately describes what the value represents

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-01-27 | Identified in code review | Keep spec and impl in sync |
