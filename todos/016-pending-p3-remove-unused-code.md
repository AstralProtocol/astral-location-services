---
status: pending
priority: p3
issue_id: "016"
tags: [code-review, simplicity, yagni]
dependencies: []
---

# Unused Code and YAGNI Violations

## Problem Statement

The codebase contains unused code for features not yet implemented, violating YAGNI (You Aren't Gonna Need It) principles. This adds confusion and maintenance burden.

**Why it matters:** ~95 lines of unused code add cognitive load without value for MVP.

## Findings

### Source
- Code Simplicity Reviewer Agent

### Evidence/Location

**Unused types and guards:**
- `types/index.ts:12-19,180-186` - OnchainInput/OffchainInput and type guards
- `input-resolver.ts:16-26` - Dead code paths for unimplemented features

**Unused error factories:**
- `error-handler.ts:23-24,29-40` - `badRequest`, `notImplemented`, `internalError`, `databaseError`, `rateLimited` (only `invalidInput` used)

**Unused constants:**
- `schemas.ts:18-19` - METERS/SQUARE_METERS constants (only CENTIMETERS variants used)
- `attestation.ts:15-17` - ATTEST_TYPE_HASH (defined but never used)

**Unused SDK field:**
- `sdk/compute.ts:21` - chainId stored but never used

**Extra EAS addresses:**
- `sdk/eas.ts:14-15` - Ethereum Mainnet/Sepolia (only Base targeted)

## Proposed Solutions

### Option A: Remove Unused Code (Recommended)
Delete all identified unused code. Total: ~95 lines.

**Pros:** Cleaner codebase, less confusion
**Cons:** Need to re-add for Phase 2
**Effort:** Small
**Risk:** Low

### Option B: Mark as TODO/Phase 2
Add clear comments marking code as intentionally for future use.

**Pros:** Code ready for Phase 2
**Cons:** Still clutters codebase
**Effort:** Minimal
**Risk:** Low

## Recommended Action

Option A for MVP clarity. Re-add when implementing Phase 2.

## Technical Details

### Affected Files
- Multiple files as listed above

## Acceptance Criteria

- [ ] All unused code removed or clearly marked
- [ ] Tests still pass
- [ ] No functionality lost

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | ~15% potential reduction |

## Resources

- Code Simplicity Reviewer analysis
