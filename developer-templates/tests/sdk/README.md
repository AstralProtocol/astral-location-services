# SDK integration test examples

Vitest tests that call the Astral compute API. They serve as both examples and integration smoke tests.

## Run

From the **monorepo root** (so `@decentralized-geo/astral-compute` resolves):

```bash
npm install
cd developer-templates/tests/sdk
npm install   # if this folder has its own package.json
npx vitest run
```

Set env to enable the tests (otherwise they are skipped):

- `ASTRAL_API_URL` – e.g. `https://api.astral.global`
- `RESOLVER_SCHEMA_UID` – boolean schema UID from your resolver
- `CHAIN_ID` – e.g. 84532 (Base Sepolia)
