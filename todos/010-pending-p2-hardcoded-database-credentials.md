---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, security, configuration]
dependencies: []
---

# Hardcoded Database Credentials

## Problem Statement

Default database credentials are hardcoded in the source code, creating credential exposure risk and potential for accidental production use of default credentials.

**Why it matters:** Hardcoded credentials in source control are a security anti-pattern. If port 5432 is exposed, the database is accessible with known credentials.

## Findings

### Source
- Security Sentinel Agent

### Evidence/Location

File: `packages/compute-service/src/db/pool.ts`

Line 5:
```typescript
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://astral:astral@localhost:5432/astral';
```

Also in Docker Compose files:
- `docker-compose.yml` (lines 22-24)
- `docker-compose.dev.yml` (lines 5-7)

### Impact

- Credential exposure in source control
- Default credentials may be used in production accidentally
- If database port exposed, trivially accessible

## Proposed Solutions

### Option A: Require DATABASE_URL (Recommended)
```typescript
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}
```

**Pros:** Forces explicit configuration
**Cons:** Breaks zero-config local dev
**Effort:** Small
**Risk:** Low

### Option B: Different Dev/Prod Defaults
Keep default for NODE_ENV=development only.

**Pros:** Convenient for dev, secure for prod
**Cons:** Still has credentials in code
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - Remove hardcoded credentials and require explicit configuration.

## Technical Details

### Affected Files
- `packages/compute-service/src/db/pool.ts`
- Update `.env.example` with required variables
- Update documentation

## Acceptance Criteria

- [ ] No hardcoded credentials in source files
- [ ] Service fails to start without DATABASE_URL
- [ ] Documentation shows required configuration
- [ ] Docker Compose uses environment variable interpolation

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Security best practice |

## Resources

- [OWASP: Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
