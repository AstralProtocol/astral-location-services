---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, sdk, security, signatures]
dependencies: []
---

# Chain ID Not Sent from SDK to API

## Problem Statement

The SDK stores `chainId` in its configuration but never sends it to the API. The server uses a `CHAIN_ID` environment variable instead. If these mismatch, signatures will be for the wrong chain.

**Why it matters:** EIP-712 signatures include chain ID in the domain separator. Wrong chain = invalid signature on target chain.

## Findings

### Source
- Manual code review

### Evidence/Location

File: `packages/sdk-extensions/src/compute.ts`

```typescript
constructor(config: AstralComputeConfig) {
  this.apiUrl = config.apiUrl;
  this.chainId = config.chainId;  // Stored but never used
}

private async request(endpoint: string, body: object) {
  // chainId is NOT included in the request
  return fetch(...);
}
```

Server in `packages/compute-service/src/index.ts`:
```typescript
const chainId = parseInt(process.env.CHAIN_ID || '84532', 10);
```

### Impact
- SDK configured for chain A, server signs for chain B = invalid attestations
- Silent failure - signatures look valid but won't verify on intended chain

## Proposed Solutions

### Option A: Send Chain ID in Request Headers (Recommended)
```typescript
// SDK
headers: {
  'Content-Type': 'application/json',
  'X-Chain-Id': this.chainId.toString(),
}

// Server
const chainId = parseInt(req.headers['x-chain-id'] || process.env.CHAIN_ID);
```

**Pros:** Clean, explicit
**Cons:** Requires coordinated SDK + server change
**Effort:** Small
**Risk:** Low

### Option B: Include Chain ID in Request Body
Add `chainId` field to all request bodies.

**Pros:** More visible
**Cons:** Changes API schema
**Effort:** Small
**Risk:** Low

## Technical Details

### Affected Files
- `packages/sdk-extensions/src/compute.ts`
- `packages/compute-service/src/routes/*.ts`
- `packages/compute-service/src/signing/attestation.ts`

## Acceptance Criteria

- [ ] SDK sends chain ID with each request
- [ ] Server uses client-specified chain ID for signing
- [ ] Mismatch between SDK and server config causes clear error

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-01-27 | Identified in code review | Chain ID must match for valid signatures |
