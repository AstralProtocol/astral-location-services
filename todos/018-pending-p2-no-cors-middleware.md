---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, security, sdk, browser]
dependencies: []
---

# No CORS Middleware

## Problem Statement

The Express app has no CORS middleware configured. Browser-based applications using the SDK will fail with cross-origin errors.

**Why it matters:** Many dapps run in browsers. Without CORS, the SDK is server-side only.

## Findings

### Source
- Manual code review

### Evidence/Location

File: `packages/compute-service/src/index.ts`

No CORS middleware is configured. Browser requests to the API will be blocked.

### Impact
- Browser-based dapps cannot use the SDK
- Limits adoption to server-side use cases only

## Proposed Solutions

### Option A: Add cors Middleware (Recommended)
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));
```

**Pros:** Simple, configurable
**Cons:** New dependency
**Effort:** Minimal
**Risk:** Low

## Technical Details

### Affected Files
- `packages/compute-service/src/index.ts`
- `packages/compute-service/package.json`

## Acceptance Criteria

- [ ] CORS headers present in responses
- [ ] Browser-based requests succeed
- [ ] CORS origin is configurable via environment variable

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-01-27 | Identified in code review | Essential for browser SDK usage |
