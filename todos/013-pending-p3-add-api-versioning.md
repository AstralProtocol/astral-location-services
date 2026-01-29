---
status: pending
priority: p3
issue_id: "013"
tags: [code-review, architecture, api-design]
dependencies: []
---

# Missing API Version Prefix

## Problem Statement

SPEC.md defines `/compute/v0/*` but implementation uses `/compute/*`. This limits future API evolution without breaking changes.

**Why it matters:** Without versioning, breaking changes require client updates or backward-compatibility hacks.

## Findings

### Source
- Architecture Strategist Agent

### Evidence/Location

SPEC.md Section 6:
```
Base URL: https://api.astral.global/compute/v0
```

Implementation (`packages/compute-service/src/index.ts`):
```typescript
app.use('/compute', computeRoutes);  // No version prefix
```

## Proposed Solutions

### Option A: Add Version Prefix (Recommended)
```typescript
app.use('/compute/v0', computeRoutes);
```

**Pros:** Matches spec, enables future versioning
**Cons:** Minor breaking change for current users
**Effort:** Minimal
**Risk:** Low

## Technical Details

### Affected Files
- `packages/compute-service/src/index.ts`
- `packages/sdk-extensions/src/compute.ts` (default URL)

## Acceptance Criteria

- [ ] API endpoints include /v0/ prefix
- [ ] SDK uses versioned endpoints
- [ ] Documentation updated

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Spec alignment |

## Resources

- SPEC.md Section 6: API Design
