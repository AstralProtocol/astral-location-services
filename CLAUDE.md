# Claude Instructions for astral-location-services

## Project Overview

This is **Astral Location Services** - a verifiable geospatial computation service for Ethereum. It performs spatial computations in a TEE (via EigenCompute) and outputs signed EAS attestations for use offchain and onchain.

## Authoritative Documentation

**SPEC.md is the authoritative technical specification.** Refer to it for:
- Architecture and system design
- API endpoints and request/response formats
- SDK structure and usage
- Data models (Policy Attestation schemas)
- Security considerations
- Deployment model (EigenCompute/TEE)

## Development Principles

- **Developer experience first**: Clear, intuitive SDK and API
- **Web3 native**: EAS attestations as the data model, wallet-based identity
- **Verifiable computation**: Operations run in TEE via EigenCompute
- **Complement Turf.js**: Turf for local/UX operations, Astral for verifiable/onchain
- **MVP mindset**: Build for learning and iteration, defer complexity

## Key Technical Decisions (from SPEC.md)

- **Separate service**: Compute service is independent, runs in EigenCompute TEE
- **Self-contained container**: PostGIS runs inside Docker container for verifiability
- **Stateless model**: Each request brings all inputs, no persistent state
- **Per-result-type schemas**: Boolean, Numeric, Geometry attestation schemas
- **Delegated attestations**: Developer submits onchain, Astral is attester
- **Phased auth**: No auth for MVP, wallet auth later

## SDK Namespace

```typescript
astral.location.*   // Location attestation operations
astral.compute.*    // Geospatial computation operations
astral.eas.*        // EAS submission helpers
```

## MVP Operations

- `distance` - Distance between two geometries (meters)
- `length` - Length of a line (meters)
- `area` - Area of a polygon (square meters)
- `contains` - Is geometry B inside geometry A?
- `within` - Is point within distance of target?
- `intersects` - Do geometries overlap?

**Units:** Metric only. No conversion options.

## Working Style

**Autonomy tiers — match the risk to the action:**

- **Just do it**: Type-checks (`tsc --noEmit`), linting, reading files, git status/diff/log, searching code, installing dependencies
- **Do it but tell me what you did**: Running test suites, build commands, multi-file edits under 5 files
- **Show me first and wait**: Deployment commands, git push, deleting/moving files, cleanup of code I didn't ask you to touch, scripts that hit external services

**General rules:**
- For multi-file refactors (5+ files), outline the plan first — but you don't need approval for small targeted edits
- After editing TypeScript files, run `npx tsc --noEmit` and fix errors before moving on
- Don't clean up, refactor, or "improve" code adjacent to what I asked you to change

## Testing Rules

- Before writing tests, read existing tests in the repo to match patterns (selectors, assertion style, mocking approach)
- Verify assertions against actual application behavior — don't guess expected values
- For E2E tests: show me the completed test before running it

## Infrastructure & Deployment

- Before saying you lack deployment information, check existing deployment scripts (`scripts/`), CI configs, docker-compose files, and environment variable references in the repo
- Do NOT browse `~/.ssh` or other credential stores — use the deployment scripts which already encode connection details
- Deployment target: VPS via SSH + EigenCompute TEE

## When Working on This Repo

1. **Read SPEC.md first** - It's the authoritative technical document
2. **Check GOAL.md** for vision and core concepts
3. **Read QUICKSTART.md** to understand developer perspective
4. **Prioritize clarity over cleverness**
5. **Think from the perspective of a dapp developer**

## Repository Structure

```
├── SPEC.md              # Technical specification (authoritative)
├── README.md            # Project overview
├── GOAL.md              # Vision and core concepts
├── QUICKSTART.md        # Developer tutorial
├── WHAT-YOU-CAN-BUILD.md # Use cases and patterns
└── CLAUDE.md            # These instructions
```

## Grant Context

This project is part of the EigenLayer Open Innovation Program. See SPEC.md Appendix for milestone mapping.
