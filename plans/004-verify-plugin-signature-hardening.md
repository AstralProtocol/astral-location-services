# Plan 004: Cryptographically verify ProofMode stamp signatures and route WitnessChain through the shared, hardened signature path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 559b38f..HEAD -- packages/astral-service/src/verify/plugins/ packages/astral-service/tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED (intentionally changes accept/reject behavior for ProofMode and possibly WitnessChain stamps)
- **Depends on**: none (write the characterization tests in Step 1 BEFORE any behavior change)
- **Category**: security
- **Planned at**: commit `559b38f`, 2026-07-02

## Why this matters

The verify subsystem's output — `signaturesValidBp`, encoded into an Astral-signed on-chain attestation (`verify/routes/proof.ts`) — tells consumers what fraction of a proof's stamps carried valid signatures. Four of six plugins (gpsd, geoclue, wifi-mls, ip-geolocation) compute this with real ECDSA recovery via a shared, recently-hardened helper. The other two do not: **ProofMode** only checks that signature fields are non-empty (a self-documented `SECURITY TODO`), so any syntactically complete signature counts as valid; **WitnessChain** re-implements the recovery loop inline, skipping the shared helper's secp256k1 algorithm guard and — critically — hashing the stamp with plain `JSON.stringify` instead of the shared `canonicalize()`, so its accept/reject decision depends on JSON key order and has drifted from the path every other plugin uses. This plan closes the ProofMode gap, consolidates WitnessChain onto the shared helper, and locks current-and-new behavior in with characterization tests first.

## Current state

### The shared, correct path (the exemplar — do not modify)

`packages/astral-service/src/verify/plugins/geo-utils.ts:171-239`: `canonicalize(obj)` (deterministic sorted-key JSON) and `checkSignatures(stamp, details)`, which strips `signatures`, canonicalizes the remainder, enforces `sig.algorithm === 'secp256k1'` (rejecting others with a details message, geo-utils.ts:216-223), then `ethers.verifyMessage(message, sig.value)` and compares the recovered address to `sig.signer.value` case-insensitively.

### ProofMode (field-presence only)

`packages/astral-service/src/verify/plugins/proofmode/verify.ts:97-123`:

```typescript
async function checkSignatures(stamp: LocationStamp): Promise<boolean> {
  if (!stamp.signatures || stamp.signatures.length === 0) return false;
  // SECURITY TODO: Signatures are NOT cryptographically verified in MVP.
  // This function only checks that required fields are present.
  // Real ProofMode stamps carry PGP signatures (ASCII-armored),
  // while wallet-signed stamps carry hex (0x-prefixed).
  // Phase 2 should implement actual verification per algorithm:
  // - 'secp256k1'/'eip712': ecrecover, ethers.verifyMessage()
  // - 'pgp': openpgp.js verify against pubkey.asc
  for (const sig of stamp.signatures) {
    if (!sig.value || sig.value.trim().length === 0) return false;
    if (!sig.signer || !sig.signer.scheme || !sig.signer.value) return false;
    if (!sig.algorithm) return false;
  }
  return true;
}
```

Its result feeds `signaturesValid` in `verifyProofModeStamp` (`proofmode/verify.ts:34`).

### WitnessChain (inline drifted loop)

`packages/astral-service/src/verify/plugins/witnesschain/verify.ts:88-106`:

```typescript
if (stamp.signatures && stamp.signatures.length > 0) {
  for (const sig of stamp.signatures) {
    try {
      const { signatures: _, ...unsigned } = stamp;
      const message = JSON.stringify(unsigned);        // ← NOT canonicalize()
      const recovered = ethers.verifyMessage(message, sig.value);  // ← no algorithm guard
      if (recovered.toLowerCase() !== sig.signer.value.toLowerCase()) { /* mismatch */ }
    } catch (e) { /* signaturesValid = false */ }
  }
}
```

WitnessChain also has a SEPARATE, correct-by-design inline verification of its challenge signature (`verify.ts:64-85`, `challengeResult.message` is a literal string, not a canonicalized stamp) — that part is NOT in scope; do not touch it. It additionally duplicates `haversineDistance`/`temporalOverlap` (`verify.ts:154-176`) that exist in `geo-utils.ts` — consolidate only if trivially safe (Step 5, optional).

### How plugins register and are tested

- Registry: `packages/astral-service/src/verify/plugins/index.ts` (ProofMode registered at ~:63).
- Existing plugin unit tests: `packages/astral-service/tests/unit/verify/{gpsd,geoclue,wifi-mls,ip-geolocation}-plugin.test.ts`, using fixtures + `signStamp`/`signStampWrongSigner` helpers from `packages/astral-service/tests/fixtures/verify.js` (see import at `tests/unit/verify/gpsd-plugin.test.ts:6`). `signStamp` signs the canonicalized unsigned stamp with a test wallet — this is the pattern to reuse.
- Real-fixture integration tests: `packages/astral-service/tests/integration/verify/real-stamps.test.ts` — these use REAL captured stamps; they are the drift detector for WitnessChain (see STOP conditions).
- E2E API tests: `tests/integration/api/verify-new-plugins.test.ts` (pattern for plugin API-level tests).

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm run test:unit` | all pass |
| Integration tests | `npm run test:db:up && npm run build`, then `npm run test:integration` with the `DATABASE_URL` value used at `.github/workflows/ci.yml:66` | all pass |

## Scope

**In scope** (the only files you should modify):
- `packages/astral-service/src/verify/plugins/proofmode/verify.ts`
- `packages/astral-service/src/verify/plugins/witnesschain/verify.ts`
- `packages/astral-service/tests/unit/verify/proofmode-plugin.test.ts` (create)
- `packages/astral-service/tests/unit/verify/witnesschain-plugin.test.ts` (create)
- `packages/astral-service/tests/fixtures/verify.js` (extend with proofmode/witnesschain fixtures only — do not alter existing exports)

**Out of scope** (do NOT touch, even though they look related):
- `geo-utils.ts` — it is the exemplar. If you believe it needs a change, STOP and report.
- WitnessChain's challenge-signature verification (`witnesschain/verify.ts:64-85`).
- The other four plugins and `verifier.ts`/`assessment.ts`.
- Adding an OpenPGP dependency. PGP verification is explicitly deferred (see Step 3).

## Git workflow

- Branch: `fix/plugin-signature-verification`
- Conventional commits; the repo has exemplars for exactly this kind of change: `fix(verify): align wifi-mls verifier with real plugin output`, `feat(verify): add canonicalize for sorted-key signature verification`.
- Commit per step. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterization tests FIRST (current behavior, no code changes)

Create `proofmode-plugin.test.ts` and `witnesschain-plugin.test.ts` in `packages/astral-service/tests/unit/verify/`, modeled on `gpsd-plugin.test.ts`. Add fixtures to `tests/fixtures/verify.js` following the existing `VALID_GPSD_STAMP` pattern (a valid proofmode stamp, a valid witnesschain stamp with `challengeResult`, plus `signStamp`-signed variants). Lock in CURRENT behavior, including the behaviors this plan will change — mark those tests with a comment `// CHARACTERIZATION: changes in Step 2/4`:
- proofmode: a stamp with a syntactically complete but cryptographically bogus signature currently yields `signaturesValid: true`.
- witnesschain: a stamp signed over `JSON.stringify(unsigned)` currently yields `signaturesValid: true`; one signed over `canonicalize(unsigned)` with different key order currently FAILS (this proves the drift).

**Verify**: `npm run test:unit` → all pass (against unmodified source).

### Step 2: ProofMode — verify secp256k1 signatures via the shared helper

In `proofmode/verify.ts`, rewrite `checkSignatures` to iterate stamps' signatures:
- `algorithm === 'secp256k1'` (or `'eip712'` if fixtures use it — check the fixture files under `tests/fixtures/` and `e2e/` for the real value): delegate to the shared logic — import `checkSignatures` from `../geo-utils.js` and use it for the whole stamp, OR replicate its exact canonicalize+verifyMessage+compare sequence if the shared function's all-or-nothing semantics don't fit mixed-algorithm stamps. Prefer importing the shared function.
- `algorithm === 'pgp'`: return `false` and record `details.pgpNotSupported = true` — unverified must no longer count as valid. Keep the existing TODO comment, updated to say PGP stamps are now rejected-as-unverified rather than accepted.
- Keep the details-population style of the file (it returns bare booleans today; if you need details, match `verifyProofModeStamp`'s existing `details` object at the call site).

Update the Step 1 characterization tests to the NEW expected behavior (bogus signature → `signaturesValid: false`; properly `signStamp`-signed proofmode stamp → `true`; pgp-algorithm stamp → `false` with the details flag).

**Verify**: `npm run test:unit` → all pass with the updated expectations.

### Step 3: Confirm no legitimate fixture regresses

Run the full integration suite. `tests/integration/verify/real-stamps.test.ts` and `tests/integration/api/verify-proof.test.ts` use realistic proof payloads; if any contains a ProofMode stamp that was passing only because of field-presence checking, the suite will now fail. If the fixture is test-local (signed by a test key), re-sign it with the fixture helpers; if it is a REAL captured ProofMode stamp with a PGP signature, the new `false` is CORRECT — update the test's expected credibility numbers and note it in the commit message.

**Verify**: integration tests → all pass.

### Step 4: WitnessChain — route the stamp-signature loop through the shared helper

In `witnesschain/verify.ts:88-106`, replace the inline loop with a call to the shared `checkSignatures(stamp, details)` from `../geo-utils.js` (it already handles: empty signature values, incomplete signer fields, missing/wrong algorithm, canonicalized message, recovery, mismatch details). Preserve the surrounding control flow: stamp signatures are only checked when present, and the `else if (!challengeResult)` no-signature branch (`verify.ts:107-110`) keeps its current behavior.

**CRITICAL check before committing this step**: run `npm run test:integration` and specifically the real-stamps suite. If a REAL WitnessChain fixture stamp fails signature verification after the change, the producer (the actual WitnessChain stamping service) signs over `JSON.stringify` ordering, not `canonicalize` — in that case this is a protocol-compatibility decision, not a code cleanup: STOP, revert Step 4, and report (recommendation to include in your report: keep the shared path but add a documented legacy fallback that tries `canonicalize` first, then `JSON.stringify`, recording which matched in details).

Update the witnesschain characterization tests: canonicalize-signed stamps now pass, JSON.stringify-key-order-dependent ones now fail (or match the fallback semantics if the STOP path was taken and the maintainer chose the fallback).

**Verify**: `npm run test:unit` and integration suite → all pass.

### Step 5 (optional, skip if anything is unclear): Deduplicate haversine/temporalOverlap

If and only if `geo-utils.ts` exports `haversineDistance` and `temporalOverlap` with IDENTICAL signatures and semantics to the private copies at `witnesschain/verify.ts:154-176` (compare the math line by line — Earth radius constant, shorter-interval denominator), delete the private copies and import the shared ones. If the implementations differ in any way, leave them and note the difference in your report.

**Verify**: `npm run test:unit` → all pass; `npm run typecheck` → exit 0.

## Test plan

- New: `tests/unit/verify/proofmode-plugin.test.ts` — valid signed stamp passes; bogus-but-complete signature fails; PGP algorithm fails with details flag; missing signatures fails; structure/consistency cases mirroring `gpsd-plugin.test.ts`'s shape.
- New: `tests/unit/verify/witnesschain-plugin.test.ts` — challenge-signature verification (valid + mismatched challenger); stamp-signature via shared path (canonicalized, wrong-signer, non-secp256k1 algorithm rejected); coordinate-range and consolidatedResult checks that exist at `witnesschain/verify.ts:112-139`.
- Pattern: `gpsd-plugin.test.ts` + fixtures/`signStamp` helper.
- All existing suites green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] `grep -n "NOT cryptographically verified" packages/astral-service/src/verify/plugins/proofmode/verify.ts` returns no matches
- [ ] `grep -n "JSON.stringify(unsigned)" packages/astral-service/src/verify/plugins/witnesschain/verify.ts` returns no matches (unless the Step 4 STOP path was taken — then this criterion is replaced by the maintainer's decision)
- [ ] `tests/unit/verify/proofmode-plugin.test.ts` and `witnesschain-plugin.test.ts` exist; `npm run test:unit` passes
- [ ] Integration suite passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Real-fixture WitnessChain stamps fail after Step 4 (see the CRITICAL check — this is expected to be the plan's main risk).
- Real ProofMode fixtures carry PGP signatures AND a test asserts they contribute `signaturesValid: true` in a way that looks like intended product behavior (i.e. a spec/doc says PGP stamps must verify) — the fix then requires the deferred OpenPGP work, which is out of scope.
- You believe `geo-utils.checkSignatures`'s all-or-nothing per-stamp semantics is wrong for multi-signature stamps — report, don't redesign.
- Any change seems to require touching `verifier.ts`, `assessment.ts`, or the plugin registry.

## Maintenance notes

- After this lands, ALL plugins verify stamp signatures through `geo-utils.checkSignatures`. A reviewer should reject any future plugin that re-implements signature recovery inline — that is exactly the drift this plan removes.
- PGP verification for real ProofMode stamps remains deferred; `details.pgpNotSupported` marks affected stamps. When implemented (openpgp.js + key distribution design), remove the rejection branch.
- `docs/VERIFY-SPEC.md` describes plugin trust models and predates four of the six plugins; updating it is a docs task deliberately not bundled here (see the audit's DOCS-02 finding in `plans/README.md`).
