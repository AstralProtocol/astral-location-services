/**
 * Compute module types.
 */

// Re-export shared types from core
export type {
  AttestationData,
  DelegatedAttestationData,
  SigningResult,
  ProblemDetails,
} from '../../core/types/index.js';

// Re-export verify types used by verified proof inputs
export type { VerifiedLocationProofResponse } from '../../verify/types/index.js';
import type { VerifiedLocationProofResponse, CredibilityVector, LocationClaim } from '../../verify/types/index.js';

// ============================================
// GeoJSON & Input Types
// ============================================

type GeometryType = 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon' | 'GeometryCollection';

export interface RawGeometryInput {
  type: GeometryType;
  coordinates?: unknown;
  geometries?: unknown;
}

export interface OnchainInput {
  uid: string;
}

export interface OffchainInput {
  uid: string;
  uri: string;
}

export interface VerifiedProofInput {
  verifiedProof: VerifiedLocationProofResponse;
}

export type Input = RawGeometryInput | OnchainInput | OffchainInput | VerifiedProofInput;

export interface ProofInputContext {
  ref: string;
  credibility: CredibilityVector;
  claim: LocationClaim;
  evaluatedAt: number;
  evaluationMethod: string;
}

export interface ResolvedInput {
  geometry: RawGeometryInput;
  ref: string;
  proofContext?: ProofInputContext;
}

// ============================================
// Request Types
// ============================================

export interface ComputeOptions {
  schema: string;
  recipient: string;
}

export interface DistanceRequest {
  from: Input;
  to: Input;
  schema: string;
  recipient: string;
}

export interface AreaRequest {
  geometry: Input;
  schema: string;
  recipient: string;
}

export interface LengthRequest {
  geometry: Input;
  schema: string;
  recipient: string;
}

export interface ContainsRequest {
  container: Input;
  containee: Input;
  schema: string;
  recipient: string;
}

export interface WithinRequest {
  point: Input;
  target: Input;
  radius: number;
  schema: string;
  recipient: string;
}

export interface IntersectsRequest {
  geometry1: Input;
  geometry2: Input;
  schema: string;
  recipient: string;
}

// ============================================
// Attestation Data Types (for signing)
// ============================================

export interface NumericPolicyAttestationData {
  result: bigint;
  units: string;
  inputRefs: string[];
  timestamp: bigint;
  operation: string;
}

export interface BooleanPolicyAttestationData {
  result: boolean;
  inputRefs: string[];
  timestamp: bigint;
  operation: string;
}

// ============================================
// Response Types
// ============================================

import type { AttestationData, DelegatedAttestationData } from '../../core/types/index.js';

export interface NumericComputeResponse {
  result: number;
  units: string;
  operation: string;
  timestamp: number;
  inputRefs: string[];
  attestation: AttestationData;
  delegatedAttestation: DelegatedAttestationData;
  proofInputs?: ProofInputContext[];
}

export interface BooleanComputeResponse {
  result: boolean;
  operation: string;
  timestamp: number;
  inputRefs: string[];
  attestation: AttestationData;
  delegatedAttestation: DelegatedAttestationData;
  proofInputs?: ProofInputContext[];
}

export type ComputeResponse = NumericComputeResponse | BooleanComputeResponse;

// ============================================
// Type Guards
// ============================================

export function isNumericResponse(response: ComputeResponse): response is NumericComputeResponse {
  return typeof response.result === 'number';
}

export function isBooleanResponse(response: ComputeResponse): response is BooleanComputeResponse {
  return typeof response.result === 'boolean';
}

export function isRawGeometry(input: Input): input is RawGeometryInput {
  return typeof input === 'object' && 'type' in input &&
    ['Point', 'MultiPoint', 'LineString', 'MultiLineString',
     'Polygon', 'MultiPolygon', 'GeometryCollection'].includes((input as RawGeometryInput).type);
}

export function isOnchainInput(input: Input): input is OnchainInput {
  return typeof input === 'object' && 'uid' in input && !('uri' in input);
}

export function isOffchainInput(input: Input): input is OffchainInput {
  return typeof input === 'object' && 'uid' in input && 'uri' in input;
}

export function isVerifiedProofInput(input: Input): input is VerifiedProofInput {
  return typeof input === 'object' && input !== null && 'verifiedProof' in input;
}
