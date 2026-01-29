---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, patterns, refactoring, maintainability]
dependencies: []
---

# Code Duplication Across Route Handlers

## Problem Statement

All 6 route handlers duplicate identical Zod schemas, validation patterns, and response construction code. This creates maintenance burden and inconsistency risk.

**Why it matters:** ~170 lines (10%) of the compute-service source code is duplicated. Changes must be made in 6 places, increasing bug risk.

## Findings

### Source
- Pattern Recognition Specialist Agent
- Code Simplicity Reviewer Agent

### Evidence/Location

**Duplicated ~20 times across files:**
- `packages/compute-service/src/routes/distance.ts`
- `packages/compute-service/src/routes/area.ts`
- `packages/compute-service/src/routes/length.ts`
- `packages/compute-service/src/routes/contains.ts`
- `packages/compute-service/src/routes/within.ts`
- `packages/compute-service/src/routes/intersects.ts`

Duplicated code:
```typescript
// Duplicated in every route file (lines 14-24):
const GeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', ...]),
  coordinates: z.any(),
}).passthrough();

const InputSchema = z.union([
  GeometrySchema,
  z.object({ uid: z.string() }),
  z.object({ uid: z.string(), uri: z.string().url() }),
]);

// Duplicated validation patterns:
z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID')
z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address')
```

### Impact

- 96 lines of schema duplication
- 60 lines of handler boilerplate duplication
- Changes require editing 6 files
- Inconsistency risk when updating schemas

## Proposed Solutions

### Option A: Extract Shared Schemas (Recommended)
Create `packages/compute-service/src/validation/schemas.ts`:
```typescript
export const GeometrySchema = z.object({...});
export const InputSchema = z.union([...]);
export const schemaUidSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const BaseRequestSchema = z.object({
  schema: schemaUidSchema,
  recipient: addressSchema,
});
```

**Pros:** Single source of truth, ~80 LOC consolidated
**Cons:** None significant
**Effort:** Small
**Risk:** Low

### Option B: Generic Route Handler Factory
Create factory function for route handlers.

**Pros:** Further reduces boilerplate
**Cons:** May be over-abstraction for MVP
**Effort:** Medium
**Risk:** Low

## Recommended Action

Option A - Extract shared schemas as immediate improvement. Consider Option B for future cleanup.

## Technical Details

### Affected Files
- All 6 route files
- New file: `packages/compute-service/src/validation/schemas.ts`

## Acceptance Criteria

- [ ] Shared schemas in single file
- [ ] All routes import from shared module
- [ ] No duplicate schema definitions
- [ ] Tests pass after refactoring

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | 13% token duplication in codebase |

## Resources

- Pattern Recognition analysis showing 13.33% duplicated tokens
