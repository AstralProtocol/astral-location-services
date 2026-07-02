# Plan 002: Serialize nonce acquisition in attestation signing so concurrent requests never receive duplicate nonces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 559b38f..HEAD -- packages/astral-service/src/core/signing/attestation.ts packages/astral-service/tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (concurrency) — also fixes a per-request RPC latency cost
- **Planned at**: commit `559b38f`, 2026-07-02

## Why this matters

Every signed delegated attestation embeds an EAS nonce. The EAS contract accepts a delegated attestation only if its signed nonce equals the attester's current on-chain nonce, then increments it — so nonces must be unique and consumed in order. Today the service fetches the on-chain nonce fresh for every signing call with no serialization: N concurrent requests all read the same value and all get signed with the same nonce, so only one of the N resulting attestations can ever be submitted on-chain; the rest revert. This was flagged as `todos/001-pending-p1-nonce-race-condition.md` (recommended fix: mutex). The codebase since moved from a local counter to per-request chain fetch (`getCurrentNonce`), which fixed the restart/replay problem but kept the duplicate-nonce race AND added a blocking JSON-RPC round-trip (to rate-limited public endpoints) on every compute/verify request. The fix is the hybrid: seed from chain, hand out locally-incremented nonces under a mutex, resync on drift. `async-mutex` is already a declared dependency (`packages/astral-service/package.json`) but is currently imported nowhere.

## Current state

- `packages/astral-service/src/core/signing/attestation.ts` — the only file that touches nonces. Key excerpts:

```typescript
// attestation.ts:47-53
async function getCurrentNonce(): Promise<bigint> {
  if (!signer || !easContract) {
    throw new Error('Signer or EAS contract not initialized');
  }
  const nonce = await easContract.getNonce(signer.address);
  return BigInt(nonce);
}
```

```typescript
// attestation.ts:191-215 (abridged)
async function signDelegatedAttestation(
  encodedData: string,
  schemaUid: string,
  recipient: string,
  refUID?: string
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const currentNonce = await getCurrentNonce();
  const deadlineTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  // ... builds EIP-712 message with `nonce: currentNonce`, signs, returns
```

- The returned object exposes the nonce at `attestation.ts:252-257`:

```typescript
delegatedAttestation: {
  signature,
  attester: signer.address,
  deadline: deadlineTimestamp,
  nonce: Number(currentNonce),
},
```

- All six compute routes (`packages/astral-service/src/compute/routes/*.ts`) and the verify route (`packages/astral-service/src/verify/routes/proof.ts`) funnel through `signDelegatedAttestation` via `signNumericAttestation` / `signBooleanAttestation` / `signVerifyAttestation`.
- Signer/contract are initialized once at startup: `initSigner` / `initSignerFromMnemonic` → `initEASContract` (`attestation.ts:58-91`).
- Repo conventions: plain module-level state in this file (`let signer`, `encoderCache` Map at `attestation.ts:27-41`); errors thrown as plain `Error` inside this module and translated by callers/middleware.

### Semantics you must preserve (context for correct judgment)

EAS delegated-attestation nonces are strictly sequential per attester. If the service issues nonces N, N+1, N+2 and the developer never submits N, then N+1 and N+2 are unsubmittable until N lands. That was true before this change (worse: all three got the SAME N, so two were unsubmittable forever). The local counter makes the common case correct; the resync path (Step 3) handles abandoned nonces by allowing operator-visible drift recovery. Document this in code comments — it is a known protocol constraint, not a bug in your implementation.

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm run test:unit` | all pass |
| Integration tests | `npm run test:db:up && npm run build`, then `npm run test:integration` with the `DATABASE_URL` value used at `.github/workflows/ci.yml:66` | all pass |

## Scope

**In scope** (the only files you should modify):
- `packages/astral-service/src/core/signing/attestation.ts`
- `packages/astral-service/tests/unit/signing/nonce-manager.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- Route files — the signing API surface (`signNumericAttestation` etc.) must not change signatures.
- `packages/sdk-extensions/**` — SDK-side submission is `plans/003-*.md`.
- Multi-instance/distributed nonce coordination (database-backed counter) — explicitly deferred; the service is single-instance by deployment design (one TEE container).
- Response shape — `delegatedAttestation.nonce` must keep being returned.

## Git workflow

- Branch: `fix/nonce-serialization`
- Conventional commits, e.g. `fix(signing): serialize nonce acquisition with mutex-guarded local counter`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a mutex-guarded nonce allocator

In `attestation.ts`, add module-level state alongside the existing `let signer` declarations:

```typescript
import { Mutex } from 'async-mutex';

const nonceMutex = new Mutex();
let nextNonce: bigint | null = null; // null = must (re)sync from chain
```

Implement:

```typescript
async function allocateNonce(): Promise<bigint> {
  return nonceMutex.runExclusive(async () => {
    if (nextNonce === null) {
      nextNonce = await getCurrentNonce(); // existing chain fetch, unchanged
    }
    const allocated = nextNonce;
    nextNonce = allocated + 1n;
    return allocated;
  });
}
```

Reset `nextNonce = null` inside `initSigner` and `initSignerFromMnemonic` (re-init must resync).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use the allocator in signDelegatedAttestation

Replace `const currentNonce = await getCurrentNonce();` at `attestation.ts:201` with `const currentNonce = await allocateNonce();`. Everything downstream (message, return shape) is unchanged.

**Verify**: `npm run typecheck` → exit 0; `npm run test:unit` → all pass (existing signing tests in `tests/unit/signing/schemas.test.ts` must be green).

### Step 3: Add a resync escape hatch

Export a function `resyncNonce(): Promise<bigint>` that, under the same mutex, refetches from chain (`nextNonce = await getCurrentNonce()`) and returns the new value. Add a code comment explaining when it matters: if issued attestations are abandoned (never submitted), locally allocated nonces run ahead of chain and later signatures are unsubmittable until earlier ones land or the operator resyncs. Do NOT wire it to an HTTP endpoint in this plan (that is an API-surface decision for the maintainer); exporting it and covering it with a unit test is the deliverable.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Unit tests

Create `packages/astral-service/tests/unit/signing/nonce-manager.test.ts`. Model the file layout after `packages/astral-service/tests/unit/signing/schemas.test.ts` (vitest, `describe`/`it`/`expect`). Mock the chain fetch: the clean seam is to mock `easContract.getNonce` — check how `tests/unit/services/eas-client.test.ts` mocks contract calls and follow that pattern. If module-level state makes direct mocking awkward, refactor minimally by extracting the allocator into a small exported class or factory (`createNonceAllocator(fetchChainNonce: () => Promise<bigint>)`) in the SAME file — dependency injection of just the fetch function is acceptable and keeps the public API unchanged.

Required cases:
1. Sequential allocation: seed fetch returns 5n → three `allocateNonce()` calls return 5n, 6n, 7n; the chain fetch ran exactly once.
2. Concurrency: `Promise.all` of 20 `allocateNonce()` calls returns 20 DISTINCT values (this is the regression test for the race).
3. Resync: after allocations, `resyncNonce()` with fetch now returning 100n → next allocation returns 100n.
4. Re-init resets: after `initSigner(...)` is called again, the next allocation refetches from chain.

**Verify**: `npm run test:unit` → all pass including 4+ new tests.

### Step 5: Full suite

**Verify**: `npm run lint` → exit 0; integration tests → all pass; `git status` → only in-scope files modified.

## Test plan

Covered in Step 4. The concurrency test (20 parallel allocations, all distinct) is the essential regression test — it fails against the current code. Integration tests (`tests/integration/attestation/*.test.ts`) must still pass unchanged; they verify signature validity and determinism.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0 and `npm run lint` exits 0
- [ ] `grep -n "async-mutex" packages/astral-service/src/core/signing/attestation.ts` returns a match (the declared dependency is finally used)
- [ ] New unit test file exists and `npm run test:unit` passes, including the 20-parallel-distinct-nonces test
- [ ] `signNumericAttestation` / `signBooleanAttestation` / `signVerifyAttestation` signatures unchanged (`git diff` shows no route file edits)
- [ ] Integration suite passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `attestation.ts` no longer matches the excerpts (drift).
- You find the signing path is ALSO called from somewhere that bypasses `signDelegatedAttestation` (search `signTypedData` across `packages/astral-service/src` — as of `559b38f` the only caller is `attestation.ts:240`).
- Making the allocator testable seems to require changing any exported function signature — report the design conflict instead of changing the API.
- Integration tests fail in a way related to nonce values (e.g. a test asserts a specific nonce) and the fix isn't a mechanical fixture update.

## Maintenance notes

- If the service ever runs multi-instance (horizontal scale outside a single TEE), the in-process counter is insufficient — that is the recorded Option B (database-backed) in `todos/001-pending-p1-nonce-race-condition.md`. A reviewer approving multi-instance deployment must revisit this.
- The per-request RPC round-trip is now gone (chain is consulted once per process + on resync). If someone reintroduces a per-request `getCurrentNonce()` call for "freshness," they reintroduce the race — the mutex-guarded allocator is the only correct entry point.
- Deferred out of this plan: exposing `resyncNonce` via an admin endpoint; nonce-gap detection/alerting.
