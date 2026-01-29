// GeoJSON geometry type string literal
type GeometryType = 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon' | 'GeometryCollection';

// Input types - how callers specify geometry
// Use a looser type for Zod compatibility while still accepting GeoJSON
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

export type Input = RawGeometryInput | OnchainInput | OffchainInput;

// Resolved input after fetching/verification
export interface ResolvedInput {
  geometry: RawGeometryInput;
  ref: string; // UID or keccak256 hash of raw geometry
}

// Compute request options
export interface ComputeOptions {
  schema: string;    // EAS schema UID
  recipient: string; // Address to receive the attestation
}

// API request bodies
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
  radius: number; // meters
  schema: string;
  recipient: string;
}

export interface IntersectsRequest {
  geometry1: Input;
  geometry2: Input;
  schema: string;
  recipient: string;
}

// Attestation response types (internal, with bigint)
export interface DelegatedAttestationResponse {
  message: {
    schema: string;
    recipient: string;
    expirationTime: bigint;
    revocable: boolean;
    refUID: string;
    data: string;
    value: bigint;
    nonce: bigint;
    deadline: bigint;
  };
  signature: {
    v: number;
    r: string;
    s: string;
  };
  attester: string;
}

// Serializable attestation response (for JSON output)
export interface SerializableAttestationResponse {
  message: {
    schema: string;
    recipient: string;
    expirationTime: string;
    revocable: boolean;
    refUID: string;
    data: string;
    value: string;
    nonce: string;
    deadline: string;
  };
  signature: {
    v: number;
    r: string;
    s: string;
  };
  attester: string;
}

// Convert internal attestation to serializable format
export function toSerializableAttestation(attestation: DelegatedAttestationResponse): SerializableAttestationResponse {
  return {
    message: {
      schema: attestation.message.schema,
      recipient: attestation.message.recipient,
      expirationTime: attestation.message.expirationTime.toString(),
      revocable: attestation.message.revocable,
      refUID: attestation.message.refUID,
      data: attestation.message.data,
      value: attestation.message.value.toString(),
      nonce: attestation.message.nonce.toString(),
      deadline: attestation.message.deadline.toString(),
    },
    signature: attestation.signature,
    attester: attestation.attester,
  };
}

export interface NumericPolicyAttestationData {
  result: bigint;       // Result scaled to integer (e.g., cm for distance)
  units: string;        // Unit description (e.g., "centimeters", "square_centimeters")
  inputRefs: string[];  // References to input geometries
  timestamp: bigint;    // Unix timestamp
  operation: string;    // Operation name (e.g., "distance", "area")
}

export interface BooleanPolicyAttestationData {
  result: boolean;
  inputRefs: string[];
  timestamp: bigint;
  operation: string;
}

// ============================================
// Flat Compute Response Types (API responses)
// ============================================

// Reusable nested interface for attestation data
export interface AttestationData {
  schema: string;      // EAS schema UID
  attester: string;    // Address of the attester
  recipient: string;   // Address to receive the attestation
  data: string;        // ABI-encoded attestation data
  signature: string;   // Compact signature (r + s + v)
}

// Reusable nested interface for delegated attestation
export interface DelegatedAttestationData {
  signature: string;   // Compact signature for delegation
  attester: string;    // Address of the delegated attester
  deadline: number;    // Unix timestamp deadline for submission
}

// Result type from signing functions
export interface SigningResult {
  attestation: AttestationData;
  delegatedAttestation: DelegatedAttestationData;
}

// Response for numeric operations (distance, area, length)
export interface NumericComputeResponse {
  result: number;                        // e.g., 523.45
  units: string;                         // "meters" | "square_meters"
  operation: string;                     // "distance" | "area" | "length"
  timestamp: number;                     // Unix timestamp (seconds)
  inputRefs: string[];                   // ["0x...", "0x..."]
  attestation: AttestationData;
  delegatedAttestation: DelegatedAttestationData;
}

// Response for boolean operations (contains, within, intersects)
export interface BooleanComputeResponse {
  result: boolean;                       // true | false
  operation: string;                     // "contains" | "within" | "intersects"
  timestamp: number;                     // Unix timestamp (seconds)
  inputRefs: string[];                   // ["0x...", "0x..."]
  attestation: AttestationData;
  delegatedAttestation: DelegatedAttestationData;
}

// Union type for all compute responses
export type ComputeResponse = NumericComputeResponse | BooleanComputeResponse;

// Type guard to distinguish numeric from boolean responses
export function isNumericResponse(response: ComputeResponse): response is NumericComputeResponse {
  return typeof response.result === 'number';
}

export function isBooleanResponse(response: ComputeResponse): response is BooleanComputeResponse {
  return typeof response.result === 'boolean';
}

// ============================================
// Legacy response type (deprecated)
// ============================================

/** @deprecated Use NumericComputeResponse or BooleanComputeResponse instead */
export interface LegacyComputeResponse {
  attestation: SerializableAttestationResponse;
  result: {
    value: number;
    units: string;
  };
  inputs: {
    refs: string[];
  };
}

// Error types per RFC 7807
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

// Type guards
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
