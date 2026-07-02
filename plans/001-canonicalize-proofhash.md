# Plan 001: Canonicalize the proofHash in the verify route so identical proofs always hash identically

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 559b38f..HEAD -- packages/astral-service/src/verify/routes/proof.ts packages/astral-service/tests/integration/api/verify-proof.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `559b38f`, 2026-07-02

## Why this matters

The `/verify/v0/proof` endpoint signs an EAS attestation whose first field is `proofHash` — the keccak256 hash of the submitted proof. Today that hash is computed over plain `JSON.stringify(proof)`, whose output depends on JSON key insertion order. Two semantically identical proofs that differ only in key order produce different `proofHash` values, so the attestation is not reproducible and any downstream verifier or dedup logic keyed on `proofHash` is unreliable. The sibling compute path was already hardened for exactly this bug (see `todos/002-pending-p1-non-canonical-json-hashing.md`, fixed in `input-resolver.ts` using `fast-json-stable-stringify`) — the verify route was added later and missed the same treatment.

## Current state

- `packages/astral-service/src/verify/routes/proof.ts` — the verify-proof endpoint; the bug is at line 52:

```typescript
// proof.ts:51-53
const timestamp = Math.floor(Date.now() / 1000);
const proofHash = keccak256(toUtf8Bytes(JSON.stringify(proof)));
const uid = keccak256(toUtf8Bytes(`${proofHash}:${timestamp}`));
```

- The repo's existing canonical-hashing convention, which this plan must match, is in `packages/astral-service/src/compute/services/input-resolver.ts:141-151`:

```typescript
import stableStringify from 'fast-json-stable-stringify';
// ...
const canonical = stableStringify(geometry);
const ref = keccak256(toUtf8Bytes(canonical));
```

- `fast-json-stable-stringify` is already a runtime dependency of `@astral/astral-service` (`packages/astral-service/package.json`), so no dependency change is needed.
- Note: `packages/astral-service/src/verify/plugins/geo-utils.ts` exports a `canonicalize()` helper used for **stamp signature verification**. Do NOT use it here — it sorts keys but its purpose is matching plugin-signed messages, and the repo's convention for *hash references* is `fast-json-stable-stringify` (see input-resolver above). Consistency with `input-resolver.ts` is the goal.

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm run test:unit` | all pass |
| Integration tests | `npm run test:db:up && npm run build`, then run `npm run test:integration` with the `DATABASE_URL` value used at `.github/workflows/ci.yml:66` (test container from `docker-compose.test.yml`, port 5433) | all pass |

## Scope

**In scope** (the only files you should modify):
- `packages/astral-service/src/verify/routes/proof.ts`
- `packages/astral-service/tests/integration/api/verify-proof.test.ts` (extend)

**Out of scope** (do NOT touch, even though they look related):
- `packages/astral-service/src/compute/services/input-resolver.ts` — already correct; it is the exemplar, not a target.
- `packages/astral-service/src/verify/plugins/geo-utils.ts` and any plugin `verify.ts` — stamp-signature canonicalization is a separate concern handled by `plans/004-*.md`.
- The synthetic `uid` derivation at `proof.ts:53` — it changes value automatically because it derives from `proofHash`; do not redesign it.

## Git workflow

- Branch: `fix/canonical-proofhash` (repo uses conventional commits, e.g. `fix(verify): import canonicalize and use far-future fixture timestamps` from `git log`)
- Single commit, message style: `fix(verify): use stable stringify for proofHash canonicalization`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap JSON.stringify for stableStringify

In `packages/astral-service/src/verify/routes/proof.ts`:
1. Add the import at the top with the other imports: `import stableStringify from 'fast-json-stable-stringify';`
2. Change line 52 from `keccak256(toUtf8Bytes(JSON.stringify(proof)))` to `keccak256(toUtf8Bytes(stableStringify(proof)))`.

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 2: Add a determinism regression test

In `packages/astral-service/tests/integration/api/verify-proof.test.ts`, add a test (match the file's existing supertest style) that:
1. Builds two versions of the same valid proof request body with object keys in different insertion orders (e.g. construct the claim object with properties in reversed order — `JSON.parse(JSON.stringify(...))` preserves order, so build the permuted object literally).
2. POSTs both to `/verify/v0/proof`.
3. Asserts both responses have HTTP 200 and **identical** `attestation.data` prefix for the proofHash — simplest robust assertion: the two responses' signed `proofHash` must match. The proofHash is retrievable by recomputing `keccak256(toUtf8Bytes(stableStringify(proof)))` in the test and/or comparing the two responses' `attestation.uid` is NOT suitable (uid includes timestamp). Assert on the recomputed hash equaling across both permutations, and that the first 32 bytes of decoded attestation data match if the existing tests already decode attestation data (check `tests/integration/attestation/decode-verify.test.ts` for the decoding pattern).

**Verify**: integration tests command from the table → all pass, including the new test.

### Step 3: Run the full suite

**Verify**: `npm run test:unit` → all pass; integration tests → all pass; `git status` → only the two in-scope files modified.

## Test plan

- New test: key-order-permuted identical proofs produce the same proofHash (Step 2), in `verify-proof.test.ts`, modeled after the existing tests in that same file.
- Existing tests in `tests/integration/api/verify-proof.test.ts` and `tests/integration/verify/real-stamps.test.ts` must still pass — they exercise real proof fixtures through this route.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "JSON.stringify(proof)" packages/astral-service/src/verify/routes/proof.ts` returns no matches
- [ ] `grep -n "stableStringify" packages/astral-service/src/verify/routes/proof.ts` returns ≥2 matches (import + use)
- [ ] Unit + integration suites pass, including the new determinism test
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `proof.ts:52` no longer matches the excerpt above (drift since plan was written).
- Any existing test asserts a specific hard-coded `proofHash` value that the change breaks in a way you cannot mechanically update (i.e. the expected value's provenance is unclear).
- You find other call sites hashing request bodies with plain `JSON.stringify` inside `packages/astral-service/src/verify/` — report them; do not fix beyond scope.

## Maintenance notes

- Any future endpoint that hashes a request-body object into signed attestation data must use `fast-json-stable-stringify`, matching `input-resolver.ts` and (after this plan) `proof.ts`. A reviewer should scrutinize new `JSON.stringify` + `keccak256` combinations.
- This changes `proofHash` values for key-order-permuted inputs relative to previously issued attestations. The service is a pre-1.0 development preview (README), so no migration is needed — but note it in the PR description.
