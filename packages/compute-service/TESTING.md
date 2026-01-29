# Testing Guide

This guide covers how to run tests for the compute service.

## Prerequisites

- Node.js 18+
- Docker (for integration tests)
- Foundry/Anvil (for local fork tests)

## Test Categories

| Category | Requires | What it tests |
|----------|----------|---------------|
| Unit | Nothing | Validation schemas, unit conversion, error formatting, hash generation |
| Integration | PostGIS | Spatial functions, API endpoints, attestation encoding |
| Local Fork | Anvil | Actual EAS contract submission on forked Base Sepolia |

## Quick Start

```bash
# Run unit tests only (no external dependencies)
npm run test:unit

# Run all tests except local fork (requires PostGIS)
npm test

# Run everything including local fork tests
RUN_LOCAL_FORK_TESTS=true npm test
```

## Setup

### 1. Test Database (PostGIS)

Start the test database:

```bash
npm run test:db:up
```

This starts PostGIS on port 5433 (separate from any dev database on 5432).

Stop when done:

```bash
npm run test:db:down
```

### 2. Local Fork (Anvil)

For testing actual EAS contract submission:

```bash
# Install Foundry (one-time)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Start Anvil fork of Base Sepolia
anvil --fork-url https://sepolia.base.org
```

Leave Anvil running in a separate terminal.

## Running Tests

### Unit Tests

No setup required:

```bash
npm run test:unit
```

### Integration Tests

Requires PostGIS running:

```bash
npm run test:db:up
npm run test:integration
```

### Local Fork Tests

Requires both PostGIS and Anvil:

```bash
# Terminal 1: PostGIS
npm run test:db:up

# Terminal 2: Anvil
anvil --fork-url https://sepolia.base.org

# Terminal 3: Run tests
RUN_LOCAL_FORK_TESTS=true npm test
```

### All Tests

```bash
npm run test:db:up
# (start anvil in another terminal if you want fork tests)
RUN_LOCAL_FORK_TESTS=true npm test
npm run test:db:down
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (from docker-compose) | PostgreSQL connection string |
| `RUN_LOCAL_FORK_TESTS` | `false` | Enable tests that submit to Anvil fork |
| `ANVIL_RPC_URL` | `http://127.0.0.1:8545` | Anvil RPC endpoint |

## Test Structure

```
tests/
├── unit/
│   ├── validation/       # Zod schema tests
│   ├── signing/          # Unit conversion tests
│   ├── middleware/       # Error handler tests
│   └── services/         # Input resolver tests
├── integration/
│   ├── api/              # API endpoint tests
│   │   ├── distance.test.ts
│   │   └── edge-cases.test.ts
│   └── attestation/      # Attestation tests
│       ├── round-trip.test.ts        # Decode & verify attestation data
│       ├── signature-verification.test.ts  # EIP-712 signature tests
│       └── onchain-submission.test.ts      # Local fork submission
├── fixtures/
│   ├── geometries.ts     # Test GeoJSON data
│   └── geometries.geojson  # Visual verification file
└── helpers/
    ├── test-server.ts    # Express app factory
    └── signature.ts      # Signature verification helpers
```

## Test Fixtures

Test geometries are defined in `tests/fixtures/geometries.ts`:

- **SF_POINT, NYC_POINT** - For distance tests (~4,130 km apart)
- **GOLDEN_GATE_PARK** - For area/contains tests
- **Edge cases** - Antimeridian, polar, holes, boundaries, precision limits

The `geometries.geojson` file can be opened in [geojson.io](https://geojson.io) for visual verification.

## What the Tests Prove

### Unit Tests
- Validation schemas catch invalid input
- Unit scaling is correct (meters ↔ centimeters)
- Error responses follow RFC 7807

### Integration Tests
- PostGIS spatial functions work correctly
- API endpoints return expected results
- Attestation data can be decoded with EAS SDK
- Signatures verify to correct attester

### Local Fork Tests
- Attestations can actually be submitted to EAS contract
- Schema registration works
- Nonce management is correct
- End-to-end flow works on real (forked) chain

## Debugging

### View test database logs

```bash
docker logs astral-test-db -f
```

### Run a single test file

```bash
npx vitest run tests/integration/api/distance.test.ts
```

### Run tests matching a pattern

```bash
npx vitest run -t "antimeridian"
```

### Watch mode

```bash
npx vitest
```
