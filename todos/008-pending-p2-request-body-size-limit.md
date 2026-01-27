---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, security, dos-protection]
dependencies: []
---

# No Request Body Size Limit

## Problem Statement

No limit on request body size allows large GeoJSON payloads to exhaust server memory, bypassing rate limiting protections.

**Why it matters:** A single request with a huge geometry can crash the service or severely degrade performance for all users.

## Findings

### Source
- Security Sentinel Agent
- Performance Oracle Agent

### Evidence/Location

File: `packages/compute-service/src/index.ts`

Line 12:
```typescript
app.use(express.json());  // No limit option
```

### Impact

- Memory exhaustion denial of service
- Large payloads bypass rate limiting (100 requests/minute means nothing if each request is 100MB)
- Server crash with OOM error

## Proposed Solutions

### Option A: Add Body Size Limit (Recommended)
```typescript
app.use(express.json({ limit: '100kb' }));
```

**Pros:** Simple one-line fix
**Cons:** May reject legitimate large geometries
**Effort:** Minimal
**Risk:** Low

### Option B: Tiered Limits by Endpoint
Different limits for different operations (area may need larger polygons).

**Pros:** More flexibility
**Cons:** More complex
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A with 100kb limit, which is generous for most geospatial use cases. Document limit in API spec.

## Technical Details

### Affected Files
- `packages/compute-service/src/index.ts`

## Acceptance Criteria

- [ ] Requests over limit are rejected with 413 status
- [ ] Limit is documented in API response
- [ ] Tests verify limit enforcement

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Simple fix, high impact |

## Resources

- [Express json() options](https://expressjs.com/en/api.html#express.json)
