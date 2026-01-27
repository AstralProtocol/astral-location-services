---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, security, authentication]
dependencies: []
---

# No Authentication on API Endpoints

## Problem Statement

All compute endpoints are completely unauthenticated. Any client can request signed attestations for arbitrary geometry data and recipients without any identity verification.

**Why it matters:** This allows unlimited abuse of the signing service, enabling attackers to generate spam attestations, exhaust resources, and potentially incur costs if attestation volume is metered.

## Findings

### Source
- Security Sentinel Agent

### Evidence/Location

File: `packages/compute-service/src/index.ts`

Lines 16-42:
```typescript
// No authentication middleware applied
app.use('/compute', computeRoutes);
```

### Impact
- Attackers can obtain unlimited signed attestations
- Attestations can be created for any recipient address
- Service abuse for spam attestations on EAS
- Potential cost implications if attestation volume is metered
- No accountability for API usage

## Proposed Solutions

### Option A: API Key Authentication (Recommended for MVP)
```typescript
import { apiKeyAuth } from './middleware/api-key-auth';

app.use('/compute', apiKeyAuth, computeRoutes);
```

**Pros:** Simple to implement, familiar pattern, works immediately
**Cons:** Keys can be shared/leaked, not Web3-native
**Effort:** Small
**Risk:** Low

### Option B: Wallet Signature Authentication
Require requests to be signed by the sender's wallet (EIP-191 or EIP-712).

**Pros:** Web3-native, ties usage to wallet identity, enables per-wallet rate limiting
**Cons:** More complex, requires SDK changes, adds latency
**Effort:** Medium
**Risk:** Low

### Option C: Keep Unauthenticated with Aggressive Rate Limiting
Enhance rate limiting with per-recipient limits and adaptive throttling.

**Pros:** No breaking changes for MVP
**Cons:** Doesn't solve abuse potential, just limits it
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A for immediate MVP with plan to add Option B in Phase 2 as documented in SPEC.md.

## Technical Details

### Affected Files
- `packages/compute-service/src/index.ts`
- New file: `packages/compute-service/src/middleware/api-key-auth.ts`

### Related Components
- Rate limiter should key by API key when available

### Database Changes
May need API key storage if not using environment variable list

## Acceptance Criteria

- [ ] Unauthenticated requests to /compute/* are rejected with 401
- [ ] Valid API key allows access
- [ ] Rate limiting keys by API key instead of just IP
- [ ] API keys can be revoked

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Documented as Phase 1 (no auth) in SPEC.md but should be addressed |

## Resources

- SPEC.md Section 8: Authentication (Phased Approach)
- [express-api-key-validator](https://www.npmjs.com/package/express-api-key-validator)
