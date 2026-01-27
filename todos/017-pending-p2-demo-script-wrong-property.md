---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, bug, examples]
dependencies: []
---

# Demo Script Accesses Wrong Property

## Problem Statement

The demo script accesses `receipt.hash` but `submitDelegated` returns `{ uid: string }`, not a transaction receipt. This causes the demo to log `undefined`.

**Why it matters:** The demo script is the first thing developers will run. A broken demo creates a bad first impression.

## Findings

### Source
- Manual code review

### Evidence/Location

File: `examples/scripts/demo.ts`

Line 141:
```typescript
const receipt = await eas.submitDelegated(result.attestation);
console.log(`Transaction hash: ${receipt.hash}`);  // receipt.hash is undefined
```

But `submitDelegated` in `packages/sdk-extensions/src/eas.ts:41-65` returns:
```typescript
return { uid };  // Not a transaction receipt
```

### Impact
- Demo script logs `undefined` for transaction hash
- Confusing developer experience

## Proposed Solutions

### Option A: Fix the Demo Script (Recommended)
```typescript
const { uid } = await eas.submitDelegated(result.attestation);
console.log(`Attestation UID: ${uid}`);
```

**Pros:** Simple fix
**Cons:** None
**Effort:** Minimal
**Risk:** Low

### Option B: Change SDK to Return Full Receipt
Have `submitDelegated` return both the UID and transaction hash.

**Pros:** More information available
**Cons:** Changes SDK interface
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - just fix the demo script.

## Technical Details

### Affected Files
- `examples/scripts/demo.ts`

## Acceptance Criteria

- [ ] Demo script logs the attestation UID correctly
- [ ] Demo script runs without errors

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-01-27 | Identified in code review | Check return types match usage |
