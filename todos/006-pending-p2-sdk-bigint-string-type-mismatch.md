---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, architecture, typescript, sdk]
dependencies: []
---

# SDK/API Type Mismatch: bigint vs string

## Problem Statement

The SDK types define `DelegatedAttestationMessage` with `bigint` fields, but the API returns stringified values. This causes type mismatches when the SDK tries to use attestation data directly.

**Why it matters:** Developers using the SDK will encounter runtime type errors when trying to submit attestations to EAS, as bigint fields are actually strings.

## Findings

### Source
- Architecture Strategist Agent

### Evidence/Location

SDK types (`packages/sdk-extensions/src/types.ts`):
```typescript
export interface DelegatedAttestationMessage {
  expirationTime: bigint;  // Actually received as string
  value: bigint;           // Actually received as string
  nonce: bigint;           // Actually received as string
  deadline: bigint;        // Actually received as string
}
```

API response (`packages/compute-service/src/types/index.ts`):
```typescript
export interface SerializableAttestationResponse {
  message: {
    expirationTime: string;  // Serialized as string for JSON
    value: string;
    nonce: string;
    deadline: string;
  };
}
```

### Impact

- Type errors when SDK consumer tries to use attestation values
- EAS SDK submission may fail due to type mismatches
- Developer confusion and poor DX

## Proposed Solutions

### Option A: SDK Converts Strings to BigInt (Recommended)
```typescript
private async request(endpoint: string, body: object): Promise<unknown> {
  const response = await fetch(...);
  const data = await response.json();

  // Convert string fields to bigint
  if (data.attestation?.message) {
    data.attestation.message = {
      ...data.attestation.message,
      expirationTime: BigInt(data.attestation.message.expirationTime),
      value: BigInt(data.attestation.message.value),
      nonce: BigInt(data.attestation.message.nonce),
      deadline: BigInt(data.attestation.message.deadline),
    };
  }
  return data;
}
```

**Pros:** Clean consumer experience, types match reality
**Cons:** Parsing logic in SDK
**Effort:** Small
**Risk:** Low

### Option B: Update SDK Types to Use Strings
Change SDK types to expect strings and provide helper functions.

**Pros:** Types match API exactly
**Cons:** Consumers need to convert to bigint themselves
**Effort:** Small
**Risk:** Low

### Option C: API Returns Both Forms
Return both string and bigint-compatible formats.

**Pros:** Maximum compatibility
**Cons:** API bloat
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - SDK should convert strings to bigint on response parsing.

## Technical Details

### Affected Files
- `packages/sdk-extensions/src/compute.ts` (response parsing)
- `packages/sdk-extensions/src/types.ts` (may need adjustment)

## Acceptance Criteria

- [ ] SDK methods return actual bigint values, not strings
- [ ] Types accurately reflect what's returned
- [ ] EAS submission works without manual conversion

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Important for SDK usability |

## Resources

- [BigInt JSON serialization](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json)
