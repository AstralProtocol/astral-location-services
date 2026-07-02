# Plan 003: Make the SDK's EAS submission and verify result types match what the API actually returns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 559b38f..HEAD -- packages/sdk-extensions/src/ packages/astral-service/src/core/signing/attestation.ts packages/astral-service/src/verify/routes/proof.ts`
> If any in-scope or referenced file changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (coordinates with plans/002 — see Maintenance notes)
- **Category**: bug
- **Planned at**: commit `559b38f`, 2026-07-02

## Why this matters

The whole point of this service is: call an API, get back a signed delegated attestation, submit it to EAS on-chain via the SDK. That last step is broken. `AstralEAS.submitDelegated` (and `estimateGas`) destructure a legacy `{ message, signature: {v,r,s}, attester }` shape, but the service returns a flat object with a **combined hex signature string** and **no `message` object**. At compile time the types don't line up; at runtime `message.schema` throws `TypeError: Cannot read properties of undefined`. Separately, the SDK's verify result types (`VerifyProofResult`, `CredibilityAssessment`, `StampResult`) describe fields the service never sends (`confidence`, top-level `uid`/`attester`/`timestamp`, `supportsClaim`), so typed consumers read `undefined` silently. This plan realigns the SDK with the real wire contract, with no server changes.

## Current state

### What the server actually returns

`packages/astral-service/src/core/signing/attestation.ts:242-258` — every compute/verify response embeds:

```typescript
return {
  attestation: {
    schema: schemaUid,
    attester: signer.address,
    recipient,
    data: encodedData,
    signature,               // combined hex string (r+s+v)
    revocable: message.revocable,   // always true
    refUID: message.refUID as string,
  },
  delegatedAttestation: {
    signature,               // same combined hex string
    attester: signer.address,
    deadline: deadlineTimestamp,   // unix seconds, number
    nonce: Number(currentNonce),   // number
  },
};
```

The signed EIP-712 message (`attestation.ts:205-215`) uses constants for the fields not present in the response: `expirationTime: 0n`, `value: 0n`. `revocable` and `refUID` ARE in the response (`attestation` object).

### What the SDK expects (broken)

`packages/sdk-extensions/src/eas.ts:41-65`:

```typescript
async submitDelegated(attestation: DelegatedAttestation): Promise<AttestationResult> {
  const { message, signature, attester } = attestation;
  const tx = await this.eas.attestByDelegation({
    schema: message.schema,
    data: { recipient: message.recipient, expirationTime: message.expirationTime,
            revocable: message.revocable, refUID: message.refUID,
            data: message.data, value: message.value },
    signature: { v: signature.v, r: signature.r, s: signature.s },
    attester,
    deadline: message.deadline,
  });
  const uid = await tx.wait();
  return { uid };
}
```

`estimateGas` (`eas.ts:71-102`) has the same shape problem. The legacy types live at `packages/sdk-extensions/src/types.ts:32-54` (`DelegatedAttestationMessage`, `DelegatedAttestationSignature`, `DelegatedAttestation`); the actual API response types at `types.ts:60-74` (`AttestationObject` — currently MISSING the `revocable`/`refUID` fields the server sends — and `DelegatedAttestationObject` — currently missing `nonce`).

### Verify result type mismatches

`packages/sdk-extensions/src/verify.ts:103-143` declares `CredibilityAssessment { confidence, stampResults, correlation?, dimensions? }` and `VerifyProofResult { uid, credibility, proof, attestation, delegatedAttestation, attester, timestamp }`.

The server actually responds (`packages/astral-service/src/verify/routes/proof.ts:75-95`):

```typescript
const response: VerifiedLocationProofResponse = {
  proof,
  credibility,          // CredibilityVector — nested dimensions.{spatial,temporal,validity,independence}, meta; NO `confidence`
  attestation: { uid, schema, attester, recipient, revocable, refUID, data, time,
                 expirationTime, revocationTime, signature },
  delegatedAttestation, // { signature, attester, deadline, nonce }
  chainId,
  evaluationMethod: 'astral-v0.3.0-tee',
  evaluatedAt: timestamp,
};
```

The authoritative server-side response/vector types are in `packages/astral-service/src/verify/types/index.ts` — read them and mirror them; do not guess field names.

### Conventions

- SDK files use ESM imports with `.js` suffixes, JSDoc on exported symbols, plain interfaces in `types.ts`/`verify.ts`.
- ethers v6 is available in the SDK package: `ethers.Signature.from(combinedHex)` yields `{ v, r, s }`.

## Commands you will need

| Purpose | Command | Expected on success |
|-----------|--------------------------|---------------------|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | exit 0 |
| SDK unit tests | `npm test --workspace=@astral/sdk-extensions` (check the workspace's package.json for the exact test script name first) | all pass |

## Scope

**In scope** (the only files you should modify):
- `packages/sdk-extensions/src/eas.ts`
- `packages/sdk-extensions/src/types.ts`
- `packages/sdk-extensions/src/verify.ts` (types only)
- `packages/sdk-extensions/src/index.ts` (JSDoc examples only)
- New test file(s) under `packages/sdk-extensions/` following its vitest config

**Out of scope** (do NOT touch, even though they look related):
- Everything under `packages/astral-service/` — this plan is SDK-side only; the server response shape is the contract, not the thing to change.
- `developer-templates/**` and `examples/**` — may contain the same stale patterns; report, don't fix.
- The legacy `DelegatedAttestation*` types may be deleted ONLY if nothing else imports them (`grep -rn "DelegatedAttestationMessage\|DelegatedAttestationSignature" packages/ developer-templates/ examples/ --include="*.ts"`); if anything outside scope imports them, keep them and mark `@deprecated`.

## Git workflow

- Branch: `fix/sdk-eas-submission`
- Conventional commits, e.g. `fix(sdk): align submitDelegated with flat API response shape`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the response types

In `packages/sdk-extensions/src/types.ts`:
1. Add `revocable: boolean;` and `refUID: string;` to `AttestationObject` (the server sends both — see Current state).
2. Add `nonce: number;` to `DelegatedAttestationObject`.

**Verify**: `npm run typecheck` → exit 0 (may surface new errors in eas.ts — expected, fixed next step).

### Step 2: Rewrite submitDelegated and estimateGas against the real shape

In `packages/sdk-extensions/src/eas.ts`, change both methods to accept the pair the API returns:

```typescript
async submitDelegated(
  attestation: AttestationObject,
  delegated: DelegatedAttestationObject
): Promise<AttestationResult> {
  const sig = Signature.from(delegated.signature); // ethers v6
  const tx = await this.eas.attestByDelegation({
    schema: attestation.schema,
    data: {
      recipient: attestation.recipient,
      expirationTime: 0n,          // service constant — attestation.ts:208
      revocable: attestation.revocable,
      refUID: attestation.refUID,
      data: attestation.data,
      value: 0n,                   // service constant — attestation.ts:212
    },
    signature: { v: sig.v, r: sig.r, s: sig.s },
    attester: delegated.attester,
    deadline: BigInt(delegated.deadline),
  });
  const uid = await tx.wait();
  return { uid };
}
```

Apply the same reconstruction to `estimateGas`. Add a comment on the two `0n` constants pointing at `packages/astral-service/src/core/signing/attestation.ts` (they are part of the signed message; if the service ever makes them variable they must be added to the response). Check the eas-sdk v2 `attestByDelegation` parameter type for whether `deadline` sits at top level or inside `data` — match the installed version's type, not this sketch, if they disagree.

Update `submitDelegatedAttestation` (the standalone helper at `eas.ts:112+`) to the new two-argument shape.

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 3: Align the verify result types

In `packages/sdk-extensions/src/verify.ts`, replace `CredibilityAssessment`, `StampResult`, and `VerifyProofResult` with interfaces mirroring the server's `VerifiedLocationProofResponse` and `CredibilityVector` from `packages/astral-service/src/verify/types/index.ts` (read that file; mirror field-for-field, keeping SDK-local naming conventions). Ensure `verifyProof`'s return type is the mirrored response type. Remove `confidence` and the top-level `uid`/`attester`/`timestamp` — they do not exist on the wire; consumers get `credibility.dimensions.*`, `attestation.uid`, `evaluatedAt`.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Fix the JSDoc examples

`packages/sdk-extensions/src/index.ts` (and any JSDoc in `eas.ts`/`verify.ts`) shows `eas.submitDelegated(result.attestation)` and `verifyResult.credibility.confidence`. Update every example to the new call shape: `eas.submitDelegated(result.attestation, result.delegatedAttestation)` and a real credibility field.

**Verify**: `grep -rn "credibility.confidence\|submitDelegated(result.attestation)" packages/sdk-extensions/src/` → only matches showing the new two-arg form, no `.confidence`.

### Step 5: Tests

Add a unit test file for the reconstruction logic (mock `EAS.attestByDelegation` to capture its argument; no network). Model test structure on `developer-templates/tests/sdk/within.example.test.ts` if the sdk-extensions package has no existing tests (it has a `vitest.config.ts`). Required cases:
1. `submitDelegated` called with a realistic fixture pair (copy a real response shape from `packages/astral-service/tests/integration/attestation/round-trip.test.ts` fixtures or construct one signed with a throwaway ethers Wallet) passes `attestByDelegation` an object whose `signature.{v,r,s}` equals `Signature.from(fixture.delegated.signature)` and whose `data.refUID`/`revocable` come from the attestation object.
2. `expirationTime` and `value` are `0n`.

**Verify**: SDK test command from the table → all pass.

## Test plan

Covered in Step 5. Additionally run the repo-wide `npm run typecheck` — the SDK examples in `developer-templates/` compile as workspaces; if their code calls the OLD one-argument `submitDelegated`, typecheck will now fail there — that is a STOP condition (see below), not something to fix silently.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0 across all workspaces
- [ ] `npm run lint` exits 0
- [ ] `grep -n "message.schema" packages/sdk-extensions/src/eas.ts` returns no matches
- [ ] `grep -n "Signature.from" packages/sdk-extensions/src/eas.ts` returns ≥2 matches (submit + estimateGas)
- [ ] New SDK unit tests pass
- [ ] `grep -rn "confidence" packages/sdk-extensions/src/verify.ts` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The server response excerpts don't match live code (drift — especially if plans/002 landed first and changed `attestation.ts` line numbers; the SHAPE should be identical, only positions shift).
- `developer-templates/` or `examples/` code fails typecheck after the signature change — list the failing files and proposed one-line fixes in your report; changing them is out of scope.
- The installed `@ethereum-attestation-service/eas-sdk` version's `attestByDelegation` types cannot accept the reconstructed shape (e.g. it requires a field the response genuinely lacks). That means the server response must be extended — a server-side change explicitly out of scope. Report it.
- You cannot construct a valid test fixture without network access.

## Maintenance notes

- The `0n` constants (`expirationTime`, `value`) couple the SDK to server behavior at `attestation.ts:208,212`. If the server makes either variable, the response contract and this SDK must change together — a reviewer should watch for that.
- Plans/002 edits `attestation.ts` (nonce logic) but not the response shape; the two plans can land in either order.
- Deferred: an end-to-end testnet submission test (requires funded key + network); the round-trip integration tests in `packages/astral-service/tests/integration/attestation/` already verify signature validity offline.
