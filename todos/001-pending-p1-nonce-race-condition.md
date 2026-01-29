---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security, data-integrity, concurrency]
dependencies: []
---

# Nonce Race Condition in Attestation Signing

## Problem Statement

The attestation signing module uses a module-level nonce counter that is not thread-safe. Under concurrent requests, multiple signing operations can read the same nonce value before incrementing, causing nonce collisions that result in invalid attestations and EAS submission failures.

**Why it matters:** This is a critical issue that will cause attestation failures under any concurrent load, making the service unreliable for production use.

## Findings

### Source
- Security Sentinel Agent
- Data Integrity Guardian Agent
- Performance Oracle Agent

### Evidence/Location

File: `packages/compute-service/src/signing/attestation.ts`

Lines 21 and 101:
```typescript
let nonce = 0n;
// ...
const currentNonce = nonce++;  // NOT ATOMIC - race condition
```

### Impact
- At 100 concurrent requests: High probability of nonce collisions
- At 1000 concurrent requests: Nearly guaranteed failures
- EAS contract will reject attestations with already-used nonces
- Service restart resets nonce to 0, enabling replay of previously signed attestations

## Proposed Solutions

### Option A: Mutex-Based Synchronization (Recommended)
```typescript
import { Mutex } from 'async-mutex';
const nonceMutex = new Mutex();

async function getNextNonce(): Promise<bigint> {
  return nonceMutex.runExclusive(() => nonce++);
}
```

**Pros:** Simple, works for single-instance deployment
**Cons:** Serializes signing operations, doesn't solve restart issue
**Effort:** Small
**Risk:** Low

### Option B: Database-Backed Nonce Counter
Persist nonce in PostgreSQL with atomic increment using `UPDATE ... RETURNING`.

**Pros:** Survives restarts, works across multiple instances
**Cons:** Adds database dependency to signing path
**Effort:** Medium
**Risk:** Medium

### Option C: Fetch Nonce from EAS Contract
Query `EAS.getNonce(attester)` on startup and before each signing operation.

**Pros:** Authoritative source, always correct
**Cons:** Adds RPC latency to each request, requires blockchain access
**Effort:** Medium
**Risk:** Low

## Recommended Action

Implement Option A (Mutex) immediately for MVP, then migrate to Option B or C for production multi-instance deployment.

## Technical Details

### Affected Files
- `packages/compute-service/src/signing/attestation.ts`

### Related Components
- All route handlers that call `signNumericAttestation` or `signBooleanAttestation`

### Database Changes
None for Option A; schema needed for Option B

## Acceptance Criteria

- [ ] Concurrent requests do not produce duplicate nonces
- [ ] Nonce increments atomically
- [ ] Service restart does not reset nonce (for production solution)
- [ ] Add test demonstrating concurrent signing works correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Critical for production reliability |

## Resources

- [EAS SDK Nonce Management](https://docs.attest.sh/docs/developer-tools/eas-sdk#delegated-attestations)
- [async-mutex npm package](https://www.npmjs.com/package/async-mutex)
- PR: N/A (current main branch)
