---
status: pending
priority: p3
issue_id: "014"
tags: [code-review, agent-native, sdk, dx]
dependencies: []
---

# SDK Missing Health Check and Discovery Methods

## Problem Statement

The SDK has no methods for checking service health or discovering available endpoints. Agents need programmatic access to service capabilities.

**Why it matters:** Agents should be able to verify connectivity and discover capabilities without human intervention.

## Findings

### Source
- Agent-Native Reviewer Agent

### Evidence/Location

File: `packages/sdk-extensions/src/compute.ts`

The `AstralCompute` class has compute methods but no:
- `health()` method
- `info()` method

Root API endpoint exists (`GET /`) but no SDK method exposes it.

## Proposed Solutions

### Option A: Add Health and Info Methods (Recommended)
```typescript
class AstralCompute {
  async health(): Promise<{ status: string; database: string }> {
    const response = await fetch(`${this.apiUrl}/health`);
    return response.json();
  }

  async info(): Promise<{ name: string; version: string; endpoints: object }> {
    const response = await fetch(`${this.apiUrl}/`);
    return response.json();
  }
}
```

**Pros:** Complete SDK coverage, agent-friendly
**Cons:** Minor addition
**Effort:** Small
**Risk:** Low

## Technical Details

### Affected Files
- `packages/sdk-extensions/src/compute.ts`
- `packages/sdk-extensions/src/types.ts`

## Acceptance Criteria

- [ ] SDK provides `health()` method
- [ ] SDK provides `info()` method
- [ ] Methods are typed

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Agent-native completeness |

## Resources

- Agent-Native Reviewer analysis
