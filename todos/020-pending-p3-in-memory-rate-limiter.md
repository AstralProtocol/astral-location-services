---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, scalability, infrastructure]
dependencies: []
---

# In-Memory Rate Limiter Won't Scale

## Problem Statement

The rate limiter uses `express-rate-limit` with its default in-memory store. This won't work correctly when running multiple service instances behind a load balancer.

**Why it matters:** In production with multiple instances, each instance has its own counter. A client could hit N × limit by distributing requests across N instances.

## Findings

### Source
- Manual code review

### Evidence/Location

File: `packages/compute-service/src/middleware/rate-limit.ts`

```typescript
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  // No store configured = uses MemoryStore
});
```

### Impact
- Single instance: Works correctly
- Multiple instances: Rate limit is per-instance, not global
- Attacker can bypass limits by hitting different instances

## Proposed Solutions

### Option A: Redis Store (Recommended for Production)
```typescript
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });

export const rateLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 60 * 1000,
  max: 100,
});
```

**Pros:** Works across instances, production-ready
**Cons:** Requires Redis infrastructure
**Effort:** Medium
**Risk:** Low

### Option B: Accept Single-Instance Limitation (MVP)
Document that rate limiting only works for single-instance deployments.

**Pros:** No changes needed
**Cons:** Not production-ready
**Effort:** None
**Risk:** Medium

## Recommended Action

Option B for MVP, Option A before production multi-instance deployment.

## Technical Details

### Affected Files
- `packages/compute-service/src/middleware/rate-limit.ts`
- `packages/compute-service/package.json` (add redis dependencies)

## Acceptance Criteria

- [ ] Rate limiting works across multiple instances (for production)
- [ ] Or documented limitation for MVP

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-01-27 | Identified in code review | Standard scaling consideration |
