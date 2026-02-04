# Astral Location Verification - Technical Specification

**Version:** 0.1.0 (Draft)
**Status:** Design Phase
**Last Updated:** 2025-02-04

---

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Framework](#conceptual-framework)
3. [Architecture](#architecture)
4. [Data Models](#data-models)
5. [Plugin System](#plugin-system)
6. [Verification Flow](#verification-flow)
7. [SDK Design](#sdk-design)
8. [API Design](#api-design)
9. [EAS Schemas](#eas-schemas)
10. [Security Considerations](#security-considerations)
11. [Future Work](#future-work)

---

## Overview

### What This Is

The Astral Verification module provides **cryptographic verification of location proofs** from multiple sources. The module consists of:

1. **Client SDK** — Collects location evidence on edge devices (mobile, server), builds signed location stamps, and bundles them into unverified location proofs
2. **Verify Service** — TEE-hosted endpoint that analyzes location evidence and returns a credibility assessment
3. **Integration** — Verify can be called independently or invoked prior to Compute operations

### Core Value Proposition

**Location stamps are evidence. Location claims are assertions. Verification quantifies how well evidence supports assertions.**

| Component | Input | Output |
|-----------|-------|--------|
| Client SDK | Raw signals (GPS, network, sensors) | Signed location stamps |
| Verify Service | Location claim + stamps | Verified Location Proof with credibility vector |

### Relationship to Existing Modules

```
astral.location.*  → Create/query location attestations (existing)
astral.verify.*    → Verify location proofs (new)
astral.compute.*   → Geospatial computations (existing)
```

The Verify module is **distinct from Geospatial Operations**:

| Geospatial Operations | Location Verification |
|----------------------|----------------------|
| Computes spatial relationships | Assesses evidence credibility |
| Input: geometries (claimed or attested) | Input: location claim + evidence |
| Output: distance, area, contains, etc. | Output: credibility vector |
| "Is A inside B?" | "How confident are we that X was at L?" |

---

## Conceptual Framework

Drawing from [Towards Stronger Location Proofs](https://collective.flashbots.net/t/towards-stronger-location-proofs/5323), we adopt a **composable evidence model**:

```
Raw Signals → Location Stamps → Evidence Bundles → Verified Location Proofs
```

### Key Concepts

**Location Claim** — An assertion that a subject was within a spatial region during a time interval:
```
C = (subject, spatial_region, temporal_range)
```

**Location Stamp** — Evidence from a single proof-of-location system (e.g., ProofMode, WitnessChain). Stamps are **independent of claims** — they capture where/when evidence was collected, not what is being claimed.

**Verification** — The process of assessing whether stamps support a claim. Outputs a **credibility vector** quantifying confidence across multiple dimensions.

### Uncertainty Model

Location proofs inherently involve uncertainty in both space and time:

- **Spatial uncertainty**: Evidence indicates a region, not a point. GPS has ~5m error, network triangulation ~50-500m.
- **Temporal uncertainty**: Evidence spans an interval, not an instant. Sensor readings take time to collect.

Verification answers: *Does the evidence's spatiotemporal footprint overlap the claim's spatiotemporal region?*

```
Claim:    [spatial_region] × [temporal_range]
Evidence: [spatial_footprint] × [temporal_footprint]
          ↓
Verification: assess overlap, check signatures, evaluate consistency
          ↓
Output:   credibility vector
```

The tradeoff: **larger margins = higher confidence, lower precision**. Applications decide what precision/confidence balance they need.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Edge Device)                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐ │
│  │   Collect   │ → │ Create Stamp│ → │    Sign     │ → │   Bundle    │ │
│  │  (signals)  │   │  (process)  │   │ (device key)│   │  (stamps)   │ │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘ │
│        ↑                                                      │        │
│   Plugin A (ProofMode)                                        │        │
│   Plugin B (WitnessChain)                                     ↓        │
│                                              ┌─────────────────────┐   │
│                                              │ Unverified Location │   │
│                                              │        Proof        │   │
│                                              └──────────┬──────────┘   │
└─────────────────────────────────────────────────────────┼──────────────┘
                                                          │
                                                          ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         ASTRAL TEE SERVICE                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        VERIFY MODULE                             │   │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │   │
│  │  │ Per-Stamp    │ → │ Cross-       │ → │ Generate Credibility │ │   │
│  │  │ Verification │   │ Correlation  │   │ Vector + Attestation │ │   │
│  │  └──────────────┘   └──────────────┘   └──────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ↓                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       COMPUTE MODULE                             │   │
│  │            (can optionally consume verified proofs)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ↓
                    ┌───────────────────────────────┐
                    │   Verified Location Proof     │
                    │   (EAS Attestation with       │
                    │    credibility vector)        │
                    └───────────────────────────────┘
```

### Key Architectural Decisions

1. **Stamps are independent of claims** — A stamp is evidence, not an assertion. The relationship between stamp and claim is only evaluated during verification.

2. **Unified plugin interface** — One interface defines the full lifecycle (`collect`, `createStamp`, `sign`, `verify`). Implementations vary by environment, but the contract is consistent.

3. **Verify each stamp independently, then cross-correlate** — Multi-stamp proofs run verification on each stamp first, then assess how they corroborate each other.

4. **Attestation-centric output** — Verification results are EAS attestations, enabling composability with existing Astral infrastructure.

5. **Separation from Compute** — Verify is independent; Compute can consume verified or unverified location inputs. Applications decide trust requirements.

---

## Data Models

### SubjectIdentifier

The subject of a location claim. Extensible to support multiple identity systems.

```typescript
interface SubjectIdentifier {
  scheme: string;   // "eth-address" | "device-pubkey" | "did:web" | ...
  value: string;    // The actual identifier
}
```

For MVP: `scheme: "eth-address"` or `scheme: "device-pubkey"`.

### LocationClaim

An assertion that a subject was within a spatial region during a time interval.

```typescript
interface LocationClaim {
  subject: SubjectIdentifier;

  spatialRegion: {
    center: [number, number];  // [longitude, latitude]
    radius: number;            // meters
  };

  temporalRange: {
    start: number;   // Unix timestamp (seconds)
    end: number;     // Unix timestamp (seconds)
  };
}
```

**Design notes:**
- Spatial region uses point + radius for simplicity. Future versions may support arbitrary polygons.
- Both spatial and temporal dimensions are ranges, not points. You cannot prove presence at a point.
- Coordinates follow GeoJSON convention: `[longitude, latitude]`.

### LocationStamp

Evidence from a single proof-of-location system. Stamps are **independent of claims**.

```typescript
interface LocationStamp {
  // Plugin identification
  plugin: string;              // "proofmode" | "witnesschain" | ...
  version: string;             // Plugin version (semver)

  // Spatiotemporal footprint of the evidence
  spatialFootprint: GeoJSON.Geometry;  // Where evidence says the subject was
  temporalFootprint: {
    start: number;             // Unix timestamp (seconds)
    end: number;               // Unix timestamp (seconds)
  };

  // Plugin-specific evidence data
  signals: Record<string, unknown>;

  // Cryptographic binding
  signatures: Signature[];
}

interface Signature {
  signer: SubjectIdentifier;
  algorithm: string;           // "secp256k1" | "ed25519" | ...
  value: string;               // Hex-encoded signature
}
```

**Design notes:**
- `spatialFootprint` is a GeoJSON geometry (polygon, circle approximation, etc.), not a point
- `signals` contains raw plugin-specific data (GPS readings, network latencies, sensor data)
- Multiple signatures support multi-party evidence (e.g., challenger attestations)

### UnverifiedLocationProof

A bundle of stamps submitted for verification against a claim.

```typescript
interface UnverifiedLocationProof {
  claim: LocationClaim;
  stamps: LocationStamp[];
}
```

### CredibilityVector

The output of verification — a multidimensional assessment of evidence quality.

```typescript
interface CredibilityVector {
  // Overall confidence (0-1)
  confidence: number;

  // Extensible dimensions (specific fields TBD based on learnings)
  dimensions: Record<string, number>;

  // Per-stamp verification results
  stampResults: StampVerificationResult[];

  // Cross-correlation assessment (for multi-stamp proofs)
  correlation?: CorrelationAssessment;
}

interface StampVerificationResult {
  stampIndex: number;
  plugin: string;

  // Did the stamp's footprint overlap the claim?
  spatialOverlap: boolean;
  temporalOverlap: boolean;

  // Were signatures valid?
  signaturesValid: boolean;

  // Plugin-specific verification output
  pluginResult: Record<string, unknown>;
}

interface CorrelationAssessment {
  // Are stamps from independent systems?
  independence: number;         // 0-1, higher = more independent

  // Do stamps corroborate each other?
  corroboration: number;        // 0-1, higher = better agreement

  // Assessment notes
  notes: string[];
}
```

**Design notes:**
- The `dimensions` field is intentionally extensible. We will define specific dimensions (accuracy, forgery_cost, temporal_integrity, etc.) as we learn from implementation.
- Per-stamp results enable applications to reason about individual evidence sources.
- Correlation assessment captures the multi-factor proof value proposition.

### VerifiedLocationProof

The final output — an EAS attestation with the credibility vector.

```typescript
interface VerifiedLocationProof {
  // The original claim
  claim: LocationClaim;

  // Verification result
  credibility: CredibilityVector;

  // References to evidence (stamps may be stored separately)
  evidenceRefs: string[];       // UIDs or URIs

  // Attestation metadata
  attestation: {
    uid: string;
    attester: string;           // Astral service key
    timestamp: number;
    chainId: number;
  };
}
```

---

## Plugin System

### Plugin Interface

All verification plugins implement a unified interface. The same interface applies across environments; implementations differ.

```typescript
interface LocationProofPlugin {
  // Plugin metadata
  readonly name: string;        // "proofmode" | "witnesschain"
  readonly version: string;     // Semantic version

  // === Collection Phase (client-side) ===

  /**
   * Collect raw signals from the environment.
   * Implementation varies by device/platform.
   */
  collect(options?: CollectOptions): Promise<RawSignals>;

  /**
   * Process raw signals into an unsigned stamp.
   * Determines spatial/temporal footprint from signals.
   */
  createStamp(signals: RawSignals): Promise<UnsignedStamp>;

  /**
   * Sign the stamp with device/node key.
   */
  sign(stamp: UnsignedStamp, signer: Signer): Promise<LocationStamp>;

  // === Verification Phase (server-side) ===

  /**
   * Verify a stamp against a claim.
   * Checks signatures, validates signals, assesses overlap.
   */
  verify(
    claim: LocationClaim,
    stamp: LocationStamp,
    options?: VerifyOptions
  ): Promise<StampVerificationResult>;
}

interface CollectOptions {
  timeout?: number;             // Max collection time (ms)
  minSignals?: number;          // Minimum signal count
}

interface VerifyOptions {
  strictMode?: boolean;         // Fail on any invalid signal
}

type RawSignals = Record<string, unknown>;

interface UnsignedStamp {
  plugin: string;
  version: string;
  spatialFootprint: GeoJSON.Geometry;
  temporalFootprint: { start: number; end: number };
  signals: Record<string, unknown>;
}
```

### Environment Considerations

The plugin interface is environment-agnostic. In practice:

| Method | Mobile (ProofMode) | Server (WitnessChain) |
|--------|-------------------|----------------------|
| `collect()` | GPS, sensors, Secure Enclave | UDP ping, challenger network |
| `createStamp()` | Fuse sensor data → region | Aggregate latencies → region |
| `sign()` | Device key (TEE-backed) | Node key, challenger sigs |
| `verify()` | Runs on TEE | Runs on TEE |

Collection methods may throw "not supported" in environments where they don't apply. Verification always runs server-side (TEE).

### MVP Plugins

**ProofMode** (priority)
- Type: Device attestation + sensor fusion
- Environment: Mobile (React Native / native)
- Evidence: GPS, accelerometer, gyroscope, hardware attestation
- Trust model: Device integrity, tamper-evident packaging

**WitnessChain** (secondary)
- Type: Infrastructure location proof
- Environment: Server/node
- Evidence: UDP ping latencies from challenger network
- Trust model: Physical network constraints, cryptoeconomic security

---

## Verification Flow

### Single-Stamp Verification

```
1. Receive: LocationClaim + LocationStamp
2. Load plugin for stamp.plugin
3. Call plugin.verify(claim, stamp)
   a. Validate signatures
   b. Check signal consistency
   c. Compute spatial overlap (stamp.spatialFootprint ∩ claim.spatialRegion)
   d. Compute temporal overlap (stamp.temporalFootprint ∩ claim.temporalRange)
4. Return StampVerificationResult
```

### Multi-Stamp Verification

```
1. Receive: UnverifiedLocationProof (claim + stamps[])
2. For each stamp (in parallel):
   a. Run single-stamp verification
   b. Collect StampVerificationResult
3. Cross-correlation analysis:
   a. Assess independence: Are stamps from uncorrelated systems?
   b. Assess corroboration: Do spatial/temporal footprints agree?
   c. Penalize redundancy: Multiple stamps from same system add little
4. Aggregate into CredibilityVector:
   a. Combine per-stamp results
   b. Weight by independence and corroboration
   c. Compute overall confidence
5. Generate VerifiedLocationProof attestation
6. Return VerifiedLocationProof
```

### Confidence Calculation (Conceptual)

```
confidence = f(
  stamp_validity[],      // Did each stamp pass verification?
  spatial_overlaps[],    // How well do footprints match claim?
  temporal_overlaps[],   // How well do intervals match claim?
  independence,          // Are evidence sources uncorrelated?
  corroboration          // Do sources agree with each other?
)
```

The exact formula will be refined through implementation. Key principle: **independent, corroborating evidence is worth more than redundant evidence**.

---

## SDK Design

### Namespace

```typescript
// Verification operations
astral.verify.stamp(claim, stamp)           // Verify single stamp
astral.verify.proof(proof)                  // Verify multi-stamp proof
astral.verify.createClaim(params)           // Helper to construct claims

// Stamp collection (client SDK)
astral.stamps.collect(plugin, options)      // Collect signals
astral.stamps.create(plugin, signals)       // Create unsigned stamp
astral.stamps.sign(stamp, signer)           // Sign stamp
astral.stamps.bundle(stamps)                // Bundle into proof
```

### Example Usage

```typescript
import { astral } from '@astral/sdk';

// === Client Side: Collect Evidence ===

// Collect signals using ProofMode plugin
const signals = await astral.stamps.collect('proofmode', {
  timeout: 5000
});

// Create and sign stamp
const unsigned = await astral.stamps.create('proofmode', signals);
const stamp = await astral.stamps.sign(unsigned, deviceSigner);

// === Submit for Verification ===

// Create a claim
const claim = astral.verify.createClaim({
  subject: { scheme: 'eth-address', value: '0x...' },
  location: { center: [-122.4194, 37.7749], radius: 100 },
  time: { start: Date.now() - 60000, end: Date.now() }
});

// Verify
const result = await astral.verify.stamp(claim, stamp);

console.log(result.credibility.confidence);  // 0.85
console.log(result.attestation.uid);         // 0xabc123...
```

### Multi-Stamp Example

```typescript
// Collect from multiple plugins
const proofmodeStamp = await collectAndSign('proofmode');
const witnessStamp = await collectAndSign('witnesschain');

// Bundle into proof
const proof = astral.stamps.bundle([proofmodeStamp, witnessStamp]);
proof.claim = claim;

// Verify multi-stamp proof
const result = await astral.verify.proof(proof);

console.log(result.credibility.correlation.independence);   // 0.9 (different systems)
console.log(result.credibility.correlation.corroboration);  // 0.8 (they agree)
console.log(result.credibility.confidence);                 // Higher than single-stamp
```

---

## API Design

### Endpoints

**POST /verify/stamp**

Verify a single stamp against a claim.

```typescript
// Request
{
  claim: LocationClaim,
  stamp: LocationStamp,
  options?: {
    chainId: number,         // For attestation signing
    submitOnchain?: boolean  // Default: false
  }
}

// Response
{
  result: StampVerificationResult,
  credibility: CredibilityVector,
  attestation: {
    uid: string,
    delegatedAttestation?: DelegatedAttestation
  }
}
```

**POST /verify/proof**

Verify a multi-stamp proof.

```typescript
// Request
{
  proof: UnverifiedLocationProof,
  options?: {
    chainId: number,
    submitOnchain?: boolean
  }
}

// Response
{
  result: VerifiedLocationProof
}
```

**GET /verify/plugins**

List available verification plugins.

```typescript
// Response
{
  plugins: [
    { name: 'proofmode', version: '0.1.0', environments: ['mobile'] },
    { name: 'witnesschain', version: '0.1.0', environments: ['server'] }
  ]
}
```

---

## EAS Schemas

### VerifiedLocationProofAttestation

Minimal onchain footprint with references to full data.

```solidity
// Schema fields
bytes32 claimHash          // Hash of the LocationClaim
uint8 confidence           // 0-100 (scaled from 0-1)
bytes32 evidenceRoot       // Merkle root of stamp hashes
bytes credibilityVector    // Encoded CredibilityVector (or IPFS CID)
```

**Design notes:**
- `claimHash` enables verification without storing full claim onchain
- `confidence` is the headline number for simple onchain checks
- `evidenceRoot` enables proving specific stamps were included
- `credibilityVector` can be embedded or referenced (cost tradeoff)

### Integration with Existing Schemas

Verified Location Proofs can be **referenced** by Policy Attestations when location inputs have been verified:

```typescript
// Policy Attestation with verified location input
{
  operation: 'contains',
  inputs: [
    { type: 'verified-location', uid: '0x...' },  // VerifiedLocationProof
    { type: 'location', uid: '0x...' }            // Standard location attestation
  ],
  result: true
}
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|------------|
| GPS spoofing | Multi-factor evidence, sensor fusion |
| Replay attacks | Temporal bounds, nonces in stamps |
| Signature forgery | Standard cryptographic verification |
| Collusion | Economic disincentives, independent systems |
| TEE compromise | Defense in depth, multiple attestation sources |

### Trust Assumptions

1. **Device integrity** (ProofMode): Assumes device TEE/Secure Enclave is not compromised
2. **Network physics** (WitnessChain): Assumes speed-of-light constraints hold
3. **Challenger honesty** (WitnessChain): Assumes majority of challengers are honest (cryptoeconomic)
4. **TEE integrity**: Assumes EigenCompute TEE execution is trustworthy

### Forgery Resistance Principle

Per the Flashbots framework:

> "The anticipated cost of faking all contributing signals should outweigh potential gains."

Multi-factor proofs with independent, uncorrelated evidence sources raise the forgery cost. Application developers should assess whether the credibility level meets their security requirements.

---

## Future Work

### Deferred for v1+

1. **TEE Remote Attestation** — Bundle EigenCompute remote attestation with verification output
2. **Additional Plugins** — Beacon networks, satellite attestation, peer witness
3. **Confidence Calibration** — Empirical tuning of confidence calculations
4. **Onchain Verification** — Solidity verifier for credibility proofs
5. **Privacy Preservation** — Zero-knowledge proofs for location without revealing exact position

### Open Research Questions

1. **Credibility vector dimensions** — What specific dimensions should we track?
2. **Cross-system correlation** — How to formally model independence between proof systems?
3. **Forgery cost quantification** — Can we rigorously estimate cost to fake evidence?

---

## References

- [Towards Stronger Location Proofs](https://collective.flashbots.net/t/towards-stronger-location-proofs/5323) — Flashbots Research
- [Location Protocol v0.2](https://github.com/DecentralizedGeo/location-protocol-spec/tree/v0.2-draft) — DecentralizedGeo
- [WitnessChain Documentation](https://witnesschain.com/docs)
- [ProofMode Documentation](https://proofmode.org)
- [Ethereum Attestation Service](https://docs.attest.org)
