---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, performance, database]
dependencies: []
---

# Database Connection Pool Configuration Needs Optimization

## Problem Statement

The connection pool configuration is missing critical settings that could cause reliability issues under load: no minimum connections (cold start penalty), no query timeout (runaway queries can exhaust pool), and tight connection timeout.

**Why it matters:** Complex geometries could hang requests indefinitely, and cold starts cause latency spikes.

## Findings

### Source
- Performance Oracle Agent

### Evidence/Location

File: `packages/compute-service/src/db/pool.ts`

Lines 7-12:
```typescript
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,  // May be too tight under load
  // Missing: min, statement_timeout, application_name
});
```

### Impact

- 50-100ms cold start penalty after idle periods
- Runaway queries can exhaust connection pool
- Hard to debug without application_name

## Proposed Solutions

### Option A: Enhanced Pool Configuration (Recommended)
```typescript
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '5', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10s max query time
  application_name: 'astral-compute-service',
});
```

**Pros:** Addresses all identified issues
**Cons:** Slightly more memory for min connections
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - Add comprehensive pool configuration with environment variable overrides.

## Technical Details

### Affected Files
- `packages/compute-service/src/db/pool.ts`

## Acceptance Criteria

- [ ] Minimum connections maintained
- [ ] Query timeout prevents runaway queries
- [ ] Application name shows in pg_stat_activity
- [ ] Pool settings configurable via environment

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Performance optimization |

## Resources

- [node-postgres Pool documentation](https://node-postgres.com/apis/pool)
