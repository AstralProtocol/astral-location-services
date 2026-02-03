# End-to-end workflow example

Single script that runs: **compute within** -> receive policy attestation -> optionally **submit delegated attestation** onchain.

## Prerequisites

- Node 18+
- `RESOLVER_SCHEMA_UID` – schema UID from your EAS resolver registration (boolean schema)

## Run (compute only)

```bash
# From monorepo root: npm install, then
cd developer-templates/examples/e2e-workflow && npm install

export CHAIN_ID=84532
export RESOLVER_SCHEMA_UID=0x...   # Your schema UID
npx tsx run.ts
```

## Run (compute + onchain submit)

```bash
export PRIVATE_KEY=0x...
export RPC_URL=https://sepolia.base.org
export CHAIN_ID=84532
export RESOLVER_SCHEMA_UID=0x...
npx tsx run.ts
```

Output: result of `within()` and, if keys are set, the attestation UID after submission.
