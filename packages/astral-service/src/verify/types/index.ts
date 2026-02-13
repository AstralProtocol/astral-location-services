/**
 * Verify Module Types
 *
 * Data models for location verification per VERIFY-SPEC.md.
 * These types support evidence-based verification of location claims.
 */

import type { DelegatedAttestationData } from '../../core/types/index.js';

// ============================================
// Core Identifiers
// ============================================

/**
 * Subject identifier following DID pattern (scheme:value).
 * Enables interoperability with multiple identity systems.
 *
 * @example
 * { scheme: "eth-address", value: "0x1234..." }
 * { scheme: "device-pubkey", value: "0xabcd..." }
 * { scheme: "did:pkh", value: "eip155:1:0x..." }
 */
export interface SubjectIdentifier {
  scheme: string;
  value: string;
}

// ============================================
// Location Protocol Types
// ============================================

/**
 * GeoJSON geometry types supported by Location Protocol.
 */
export type LPGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection';

/**
 * GeoJSON geometry object.
 */
export interface LPGeometry {
  type: LPGeometryType;
  coordinates?: unknown;
  geometries?: LPGeometry[];
}

/**
 * Location data per Location Protocol v0.2.
 * Can be GeoJSON, H3 index, or other location types.
 */
export type LocationData = LPGeometry | string;

// ============================================
// Location Claim
// ============================================

/**
 * Temporal bounds for a location claim or stamp.
 */
export interface TimeBounds {
  start: number; // Unix timestamp (seconds)
  end: number;   // Unix timestamp (seconds)
}

/**
 * Location Claim - An assertion about the timing and location of an event.
 *
 * Extends Location Protocol v0.2 with verification-specific fields.
 * The event could be: a person's presence, a transaction's origin,
 * an asset's location, a delivery, etc.
 */
export interface LocationClaim {
  // === Location Protocol v0.2 fields (required) ===
  lpVersion: string;          // "0.2"
  locationType: string;       // "geojson-point", "h3-index", etc.
  location: LocationData;     // The claimed location
  srs: string;                // Spatial reference system URI

  // === Verification-specific fields ===

  /** Subject of the claim (who/what was at the location) */
  subject: SubjectIdentifier;

  /** Spatial uncertainty in meters (required for point locations) */
  radius: number;

  /** Temporal bounds for the claim */
  time: TimeBounds;

  /** What event is being claimed (optional) */
  eventType?: string; // "presence", "transaction", "delivery", etc.
}

// ============================================
// Location Stamp
// ============================================

/**
 * Cryptographic signature binding evidence to a signer.
 */
export interface Signature {
  signer: SubjectIdentifier;
  algorithm: string;  // "secp256k1" | "ed25519" | ...
  value: string;      // Hex-encoded signature
  timestamp: number;  // When signature was created
}

/**
 * Location Stamp - Evidence from a proof-of-location system.
 *
 * Stamps are independent of claims. They provide evidence about
 * the timing and location of an event, which may come from:
 * - Direct observation: Sensor data, network measurements, hardware attestation
 * - Indirect/derived sources: Documents, records, institutional attestations
 */
export interface LocationStamp {
  // === Location data (conforms to LP v0.2) ===
  lpVersion: string;          // "0.2"
  locationType: string;       // "geojson-point", "geojson-polygon", etc.
  location: LocationData;     // Where evidence indicates subject was
  srs: string;                // Spatial reference system URI

  /** Temporal footprint of the evidence */
  temporalFootprint: TimeBounds;

  /** Plugin that created this stamp */
  plugin: string;             // "proofmode" | "witnesschain" | ...
  pluginVersion: string;      // Plugin version (semver)

  /** Plugin-specific evidence data */
  signals: Record<string, unknown>;

  /** Cryptographic binding */
  signatures: Signature[];
}

// ============================================
// Location Proof
// ============================================

/**
 * Location Proof - A claim bundled with supporting evidence (stamps).
 *
 * This is the artifact submitted for verification.
 * Single-stamp proofs are valid. Multi-stamp proofs enable
 * cross-correlation analysis.
 */
export interface LocationProof {
  claim: LocationClaim;
  stamps: LocationStamp[];
}

// ============================================
// Verification Results (aligned with @decentralized-geo/astral-sdk)
// ============================================

/**
 * Per-stamp result within a proof evaluation.
 *
 * Combines internal verification (is the stamp valid?) with raw relevance
 * measurements (how close is it to the claim?). No opinionated scoring —
 * consumers interpret the measurements.
 *
 * Matches StampResult in @decentralized-geo/astral-sdk/plugins/types.
 */
export interface StampResult {
  stampIndex: number;
  plugin: string;

  /** Signature verification passed */
  signaturesValid: boolean;
  /** Structure conforms to expected format */
  structureValid: boolean;
  /** Internal signals are self-consistent */
  signalsConsistent: boolean;

  /** Haversine distance from stamp to claim location (meters) */
  distanceMeters: number;
  /** Fraction of stamp/claim time windows that overlap (0-1) */
  temporalOverlap: number;
  /** Is the stamp within the claim's radius (accounting for stamp accuracy)? */
  withinRadius: boolean;

  /** Additional details (verification + evaluation) */
  details: Record<string, unknown>;
}

/**
 * Multidimensional credibility assessment.
 *
 * Matches CredibilityVector in @decentralized-geo/astral-sdk/plugins/types.
 * No summary scores — applications apply their own policy logic.
 */
export interface CredibilityVector {
  dimensions: {
    spatial: {
      meanDistanceMeters: number;
      maxDistanceMeters: number;
      withinRadiusFraction: number;
    };
    temporal: {
      meanOverlap: number;
      minOverlap: number;
      fullyOverlappingFraction: number;
    };
    validity: {
      signaturesValidFraction: number;
      structureValidFraction: number;
      signalsConsistentFraction: number;
    };
    independence: {
      uniquePluginRatio: number;
      spatialAgreement: number;
      pluginNames: string[];
    };
  };

  stampResults: StampResult[];

  meta: {
    stampCount: number;
    evaluatedAt: number;
    evaluationMode: 'local' | 'tee' | 'zk';
  };
}

// ============================================
// Stamp Verification (Internal)
// ============================================

/**
 * Result of verifying a stamp's internal validity (no claim assessment).
 */
export interface StampVerificationResult {
  valid: boolean;
  signaturesValid: boolean;
  structureValid: boolean;
  signalsConsistent: boolean;
  /** Plugin-specific verification details */
  details: Record<string, unknown>;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Request to verify a stamp's internal validity.
 */
export interface VerifyStampRequest {
  stamp: LocationStamp;
}

/**
 * Response from stamp verification.
 */
export type VerifyStampResponse = StampVerificationResult;

/**
 * Options for proof verification.
 */
export interface VerifyProofOptions {
  chainId?: number;
  submitOnchain?: boolean;
  schema?: string;        // Override default schema UID
  recipient?: string;     // Attestation recipient
}

/**
 * Request to verify a location proof.
 */
export interface VerifyProofRequest {
  proof: LocationProof;
  options?: VerifyProofOptions;
}

/**
 * Response from proof verification.
 *
 * Matches VerifiedLocationProof in @decentralized-geo/astral-sdk/plugins/types.
 */
export interface VerifiedLocationProofResponse {
  /** The original proof that was verified (claim + stamps) */
  proof: LocationProof;

  /** Full multidimensional credibility assessment (no summary score) */
  credibility: CredibilityVector;

  /** EAS attestation signed by the verifier */
  attestation: {
    uid: string;
    schema: string;
    attester: string;
    recipient: string;
    revocable: boolean;
    refUID: string;
    data: string;
    time: number;
    expirationTime: number;
    revocationTime: number;
    signature?: string;
  };

  /** Delegated attestation for onchain submission via attestByDelegation */
  delegatedAttestation: DelegatedAttestationData;

  /** Chain where the attestation was created */
  chainId?: number;

  /** Identifier for the evaluation method */
  evaluationMethod: string;

  /** When evaluation was performed (Unix seconds) */
  evaluatedAt: number;
}

/**
 * Plugin metadata for listing.
 */
export interface PluginInfo {
  name: string;
  version: string;
  environments: string[];
  description: string;
}

/**
 * Response from plugins list endpoint.
 */
export interface PluginsListResponse {
  plugins: PluginInfo[];
}

// ============================================
// EAS Attestation Data
// ============================================

/**
 * Data for verify attestation signing.
 * Maps to the new EAS schema with CredibilityVector dimensions.
 *
 * Fractions are encoded as basis points (uint16, 0-10000 = 0.00%-100.00%).
 */
export interface VerifyAttestationData {
  proofHash: string;              // bytes32
  meanDistanceMeters: number;     // uint32
  maxDistanceMeters: number;      // uint32
  withinRadiusBp: number;         // uint16 (basis points)
  meanOverlapBp: number;          // uint16 (basis points)
  minOverlapBp: number;           // uint16 (basis points)
  signaturesValidBp: number;      // uint16 (basis points)
  structureValidBp: number;       // uint16 (basis points)
  signalsConsistentBp: number;    // uint16 (basis points)
  uniquePluginRatioBp: number;    // uint16 (basis points)
  stampCount: number;             // uint8
}

// ============================================
// Type Guards
// ============================================

/**
 * Check if a location is a GeoJSON geometry.
 */
export function isGeoJSONGeometry(location: LocationData): location is LPGeometry {
  return typeof location === 'object' && 'type' in location;
}

/**
 * Check if a proof has multiple stamps.
 */
export function isMultiStampProof(proof: LocationProof): boolean {
  return proof.stamps.length > 1;
}
