# Claude Instructions for astral-location-services

## Project Overview
This is the **geospatial policy engine** for the Astral Protocol - a hosted service that performs spatial computations and outputs signed EAS attestations for use offchain and onchain.

## Development Principles
- **Developer experience first**: This should be delightfully clear and easy to use
- **Web3 native**: Everything uses EAS attestations as the data model
- **Geospatial-friendly**: Make spatial concepts accessible to web3 developers
- **MVP mindset**: Build for learning and iteration, defer complexity (verification, custom policies)

## Architecture Context
- **Input**: Location attestations (EAS format, referenced by UID or raw geometry)
- **Processing**: Stateless geospatial computations (distance, containment, etc.)
- **Output**: Signed EAS attestations containing results (offchain or onchain)

## What Exists Already
- Location Protocol schema (EAS-based, PostGIS-inspired)
- SDK for Location Protocol
- Onchain registry (EAS contracts)
- API indexer (OGC API Features conformant)
- Location verification/proofs framework (in development)

## Key Constraints
- Keep aligned with existing Location Protocol schema and infrastructure
- Changes have consequences (docs, deployments) but we're still v0 - iterate to stronger design
- No custom stored policies for MVP - simple composable functions only
- No query integration in policy engine - developers orchestrate separately

## Key Design Decisions (2025-10-17)

**Architecture:**
- Separate compute service, shares Postgres with indexer
- Accessed via unified API (`api.astral.global/compute/*`)
- Service holds signing keys, returns signed Policy Attestations

**SDK Structure:**
- `sdk.location.*` - Location attestation operations
- `sdk.compute.*` - Geospatial computation operations
- Namespaced by domain, not by action type

**Operations First, Predicates Later:**
- Start with atomic operations (distance, contains, intersects)
- Compose into predicates/policies later
- Maps to PostGIS/Turf mental model

**Complement Turf.js, Don't Replace:**
- Turf for local/UX operations (instant feedback, free)
- Astral for verifiable/onchain operations (signed, trustable)
- Developers use both in same app

**EAS Resolver Integration:**
- Resolvers can gate smart contract actions based on policy results
- Attestation creation = business logic execution (atomic)
- Enables location-gated smart contracts trivially

**Input Flexibility:**
- UIDs as primary (canonical location references)
- Raw GeoJSON as convenience (for prototyping)
- Service resolves UIDs to geometry from DB

**Naming:**
- "Policy Attestations" for computation results
- Aligns with Turf method names where possible
- "Astral Verifier" for the oracle/signer

## When Working on This Repo
1. Refer to GOAL.md for the core vision
2. Check TECHNICAL-DESIGN.md for architecture details
3. Read QUICKSTART.md to understand developer perspective
4. Check existing Location Protocol implementation before designing new schemas
5. Prioritize clarity over cleverness
6. Think from the perspective of a dapp developer using this service
