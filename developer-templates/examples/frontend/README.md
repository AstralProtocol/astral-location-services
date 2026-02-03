# React/Next.js frontend example

Minimal integration of Astral Location Services: run a `within` check and optionally submit the delegated attestation onchain.

## Setup

From the **monorepo root** (so the workspace package resolves):

```bash
npm install
cd developer-templates/examples/frontend && npm install
```

Or from this directory with the published SDK:

```bash
npm install @decentralized-geo/astral-compute ethers next react react-dom
```

Set env (or use `.env.local`):

- `NEXT_PUBLIC_CHAIN_ID` – e.g. 84532 (Base Sepolia)
- `NEXT_PUBLIC_RESOLVER_SCHEMA_UID` – schema UID from your resolver registration

## Run

```bash
npm run dev
```

Connect a wallet, enter a landmark UID (or use the demo point), then run the within check and submit attestation if desired.
