---
status: pending
priority: p3
issue_id: "015"
tags: [code-review, performance, optimization]
dependencies: []
---

# SchemaEncoder Instantiated on Every Request

## Problem Statement

A new `SchemaEncoder` is created on every signing operation. Schema parsing happens repeatedly for identical schemas, wasting CPU cycles.

**Why it matters:** Easy performance win - 0.5-2ms per request.

## Findings

### Source
- Performance Oracle Agent

### Evidence/Location

File: `packages/compute-service/src/signing/attestation.ts`

Lines 54, 78:
```typescript
// Inside signNumericAttestation:
const encoder = new SchemaEncoder(NUMERIC_POLICY_SCHEMA);

// Inside signBooleanAttestation:
const encoder = new SchemaEncoder(BOOLEAN_POLICY_SCHEMA);
```

## Proposed Solutions

### Option A: Cache Encoders at Module Level (Recommended)
```typescript
const numericEncoder = new SchemaEncoder(NUMERIC_POLICY_SCHEMA);
const booleanEncoder = new SchemaEncoder(BOOLEAN_POLICY_SCHEMA);

export async function signNumericAttestation(...) {
  const encodedData = numericEncoder.encodeData([...]);
  // ...
}
```

**Pros:** Simple, no tradeoffs
**Cons:** None
**Effort:** Minimal
**Risk:** Low

## Technical Details

### Affected Files
- `packages/compute-service/src/signing/attestation.ts`

## Acceptance Criteria

- [ ] Encoders instantiated once at module load
- [ ] Same encoder reused across requests
- [ ] Performance improvement verified

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Easy performance win |

## Resources

- Performance Oracle analysis
