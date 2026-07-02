# Plan 005: Validate that client-supplied schema UIDs and chainId match what the signer actually encodes and signs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 559b38f..HEAD -- packages/astral-service/src/core/config/schemas.ts packages/astral-service/src/compute/routes/ packages/astral-service/src/verify/routes/proof.ts packages/astral-service/src/core/signing/attestation.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (tightens the public API's accepted inputs — a deliberate behavior change)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `559b38f`, 2026-07-02

## Why this matters

The service's signing key is its crown jewel: consumers (smart contracts, resolvers) trust any `(schema, data)` pair it signs. Two request fields currently reach the signer without being bound to what actually happens:

1. **Schema UID**: a caller may supply any 64-hex-char `schema` value. The service encodes the payload with a hardcoded layout for the operation type (numeric vs boolean vs verify) but stamps the EIP-712 message with the caller's arbitrary UID. The signer therefore vouches for attestations whose declared schema can disagree with the encoded data layout — a type-confusion surface: e.g. a numeric result labeled with the boolean schema UID decodes on-chain as a boolean under positional ABI decoding (see the consumer pattern in `examples/contracts/LocationGatedNFT.sol`, which decodes positionally and acts on a `true` first field).
2. **chainId**: routes use the request's `chainId` for schema lookup and input resolution, but the EIP-712 domain and nonce contract are fixed at startup from the `CHAIN_ID` env (`currentChainId`). A request with a different `chainId` plus a custom `schema` UID gets an attestation signed for the SERVER's chain while the response implies the requested chain — misleading at best.

Schema override is an intended feature ("Clients can override with custom schemas (e.g., for resolver contracts)" — `core/config/schemas.ts:5-6`), so the fix is an allowlist per result type, not a ban.

## Current state

- Validation only checks the format, not the identity — `packages/astral-service/src/compute/validation/schemas.ts:119-133`:

```typescript
export const ChainIdSchema = z.number().int().positive('chainId must be a positive integer');
export const SchemaUidSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID');
export const OptionalSchemaUidSchema = SchemaUidSchema.optional();
// ...
const BaseRequestSchema = z.object({
  chainId: ChainIdSchema,
  schema: OptionalSchemaUidSchema,
  recipient: RecipientSchema,
});
```

- Route pattern (same in all six compute routes; excerpt from `compute/routes/distance.ts:27-35`):

```typescript
const { from, to, schema: requestSchema, recipient, chainId } = parsed.data;
const schema = requestSchema ?? getNumericSchemaUid(chainId);
if (!schema) {
  throw Errors.invalidInput('schema is required. Either provide a schema UID in the request or configure NUMERIC_SCHEMA_UID environment variable.');
}
```

Boolean routes (`contains.ts`, `within.ts`, `intersects.ts`) use `getBooleanSchemaUid(chainId)`; numeric routes (`distance.ts`, `area.ts`, `length.ts`) use `getNumericSchemaUid(chainId)`; the verify route (`verify/routes/proof.ts:36-44`) uses `getVerifySchemaUid(chainId)`.

- Config — `packages/astral-service/src/core/config/schemas.ts`: `initSchemaConfig(chainId)` (called once at startup with the env chain, `src/index.ts:103`) stores `{numeric, boolean, verify}` UIDs from `NUMERIC_SCHEMA_UID`/`BOOLEAN_SCHEMA_UID`/`VERIFY_SCHEMA_UID` env vars into `schemaConfigs[chainId]`. Lookups for any OTHER chainId return `undefined`, so today a foreign-chainId request without a custom schema fails with the misleading "schema is required" error, and WITH a custom schema it succeeds while signing over the server chain's EIP-712 domain (`core/signing/attestation.ts:218-223`, `currentChainId` set at startup, `attestation.ts:28,77,88`).

- Error convention: `Errors.invalidInput(detail)` from `core/middleware/error-handler.js` → RFC 7807 responses; tests assert on `title`/`detail`.

- Signing entry points that receive the unchecked UID: `signNumericAttestation`, `signBooleanAttestation` (`attestation.ts:106-149`), `signVerifyAttestation` (`attestation.ts:158+`).

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
- `packages/astral-service/src/core/config/schemas.ts` (allowlist + chain validation helpers)
- The seven route files: `packages/astral-service/src/compute/routes/{distance,area,length,contains,within,intersects}.ts`, `packages/astral-service/src/verify/routes/proof.ts`
- `packages/astral-service/tests/unit/validation/schemas.test.ts` or a new `tests/unit/config/schema-allowlist.test.ts`
- `packages/astral-service/tests/integration/api/` — extend existing route tests
- `.env.example`, `.env.staging.example`, `.env.production.example` (document the new env vars)

**Out of scope** (do NOT touch, even though they look related):
- `core/signing/attestation.ts` — plans/002 owns changes there; this plan validates BEFORE signing is called. (Read it, don't edit it.)
- On-chain SchemaRecord fetching/verification (checking the registry's declared field layout) — a heavier alternative deliberately deferred; the allowlist is the MVP-consistent fix.
- The SDK and examples.

## Git workflow

- Branch: `fix/schema-chainid-binding`
- Conventional commits, e.g. `fix(api): validate schema UID allowlist and chainId before signing`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add allowlist + chain validation to config/schemas.ts

Extend `initSchemaConfig` to also read three optional env vars: `NUMERIC_SCHEMA_UIDS_ALLOWED`, `BOOLEAN_SCHEMA_UIDS_ALLOWED`, `VERIFY_SCHEMA_UIDS_ALLOWED` — comma-separated 0x-64-hex UIDs, validated with the existing `schemaUidPattern`, stored per chain alongside the defaults. Add two exported helpers:

```typescript
/** True if `uid` may be signed for the given result type on `chainId`:
 *  it is the configured default for that type, or in that type's allowlist. */
export function isSchemaAllowed(chainId: number, type: 'numeric' | 'boolean' | 'verify', uid: string): boolean

/** True if the service signs for this chain (i.e. chainId was initialized). */
export function isChainSupported(chainId: number): boolean
```

Match the file's existing style (module-level `schemaConfigs` record, startup console logging of what was configured).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Enforce in every route

In each of the seven route files, immediately after the existing schema-resolution block, add (with the operation's correct type):

```typescript
if (!isChainSupported(chainId)) {
  throw Errors.invalidInput(`Unsupported chainId ${chainId}. This service signs for chain(s): <list from config>.`);
}
if (requestSchema && !isSchemaAllowed(chainId, 'numeric', requestSchema)) {
  throw Errors.invalidInput('Provided schema UID is not allowed for this operation type. Configure *_SCHEMA_UIDS_ALLOWED to permit custom schemas.');
}
```

Keep the seven diffs mechanically identical apart from the type string. (Yes, this duplicates a check seven times — route-handler consolidation is a separate known issue, `todos/007-pending-p2-code-duplication-routes.md`; do NOT refactor the routes here.)

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 3: Document the new env vars

Add commented `NUMERIC_SCHEMA_UIDS_ALLOWED=` / `BOOLEAN_SCHEMA_UIDS_ALLOWED=` / `VERIFY_SCHEMA_UIDS_ALLOWED=` entries with one explanatory comment block to all three `.env*.example` files, next to the existing `*_SCHEMA_UID` entries. No real values.

**Verify**: `grep -l "SCHEMA_UIDS_ALLOWED" .env.example .env.staging.example .env.production.example` → all three files listed.

### Step 4: Tests

Unit (new file or extend `tests/unit/validation/schemas.test.ts` — match its vitest style):
1. `isSchemaAllowed` accepts the configured default; accepts an allowlisted UID; rejects a well-formed but unknown UID; rejects a boolean-allowlisted UID for `'numeric'`.
2. `isChainSupported` true for the initialized chain, false otherwise.

Integration (extend `tests/integration/api/distance.test.ts` and `contains.test.ts`, matching their supertest patterns):
1. Request with `chainId` ≠ configured chain → 400 with the unsupported-chain detail.
2. Request with a well-formed random `schema` UID not in any allowlist → 400.
3. Request with the configured default schema → 200 (existing happy paths must keep passing — they use the configured schema and chain; if any existing test posts a custom schema UID, add that UID to the test env's allowlist rather than weakening the check).

**Verify**: `npm run test:unit` → all pass; integration suite → all pass.

## Test plan

Covered in Step 4. The two 400-path integration tests are the regression tests for this vulnerability class; the untouched happy paths prove no legitimate flow broke. Check how integration tests set env (search `NUMERIC_SCHEMA_UID` under `tests/` and `vitest` setup files) and follow that mechanism for allowlist vars.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] `grep -ln "isSchemaAllowed" packages/astral-service/src/compute/routes/*.ts packages/astral-service/src/verify/routes/proof.ts` lists all seven route files
- [ ] `grep -c "SCHEMA_UIDS_ALLOWED" .env.example` ≥ 3
- [ ] New unit + integration tests pass; full suites green
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Route files don't match the excerpt pattern (drift, or plans/007-style refactor landed first — re-anchor to wherever schema resolution moved).
- You find documentation (SPEC.md §Data Models / QUICKSTART) promising that ANY registered schema UID is accepted without operator configuration — that contradicts this plan's design and the maintainer must arbitrate.
- Existing integration tests rely on posting arbitrary schema UIDs in more than a couple of places (suggests the override is more load-bearing than the audit assessed).
- Enforcement seems to require modifying `attestation.ts`.

## Maintenance notes

- This is deny-by-default for CUSTOM schemas while keeping configured defaults working. Operators enabling a partner's resolver schema add it to the type-correct allowlist — a reviewer should confirm new allowlist entries actually have the layout of that result type (the layouts are `NUMERIC_POLICY_SCHEMA` / `BOOLEAN_POLICY_SCHEMA` / `VERIFY_SCHEMA` in `core/signing/schemas.ts`).
- Stronger long-term option (deferred): fetch the SchemaRecord from the on-chain registry and structurally compare its field list to the encoder's — removes the manual allowlist but adds an RPC dependency to the hot path.
- If multi-chain signing is ever added (per-request domain), `isChainSupported` and the signing domain selection must change together; today both assume the single startup chain.
