import type { Geometry } from 'geojson';

// Input types
export type RawGeometryInput = Geometry;

export interface OnchainInput {
  uid: string;
}

export interface OffchainInput {
  uid: string;
  uri: string;
}

// Support direct UID string in addition to objects
export type Input =
  | string            // Direct UID: "0xabc..."
  | RawGeometryInput  // GeoJSON Geometry
  | OnchainInput      // { uid: string }
  | OffchainInput;    // { uid: string, uri: string }

// Compute options
export interface ComputeOptions {
  schema: string;
  recipient?: string;  // Optional, defaults to zero address on server
}

// ============================================================================
// Legacy attestation types (kept for EAS submission compatibility)
// ============================================================================

export interface DelegatedAttestationMessage {
  schema: string;
  recipient: string;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  data: string;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface DelegatedAttestationSignature {
  v: number;
  r: string;
  s: string;
}

export interface DelegatedAttestation {
  message: DelegatedAttestationMessage;
  signature: DelegatedAttestationSignature;
  attester: string;
}

// ============================================================================
// New flat API response types
// ============================================================================

// Attestation object returned by API
export interface AttestationObject {
  schema: string;
  attester: string;
  recipient: string;
  data: string;
  signature: string;
}

// Delegated attestation for submission
export interface DelegatedAttestationObject {
  signature: string;
  attester: string;
  deadline: number;
}

// Response for numeric operations (distance, area, length)
export interface NumericComputeResult {
  result: number;
  units: string;
  operation: string;
  timestamp: number;
  inputRefs: string[];
  attestation: AttestationObject;
  delegatedAttestation: DelegatedAttestationObject;
}

// Response for boolean operations (contains, within, intersects)
export interface BooleanComputeResult {
  result: boolean;
  operation: string;
  timestamp: number;
  inputRefs: string[];
  attestation: AttestationObject;
  delegatedAttestation: DelegatedAttestationObject;
}

export type ComputeResult = NumericComputeResult | BooleanComputeResult;

// SDK configuration
export interface AstralComputeConfig {
  apiUrl?: string;   // Optional, defaults to production URL
  chainId: number;   // Required
}

// EAS submission types
export interface SubmitDelegatedOptions {
  signer: any; // ethers.Signer
  easContractAddress?: string;
}
