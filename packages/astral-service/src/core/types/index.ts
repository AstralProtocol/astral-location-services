/**
 * Core shared types used by both compute and verify modules.
 */

// ============================================
// Attestation Types (shared by compute & verify)
// ============================================

/**
 * Attestation data returned by API.
 */
export interface AttestationData {
  schema: string;      // EAS schema UID
  attester: string;    // Address of the attester
  recipient: string;   // Address to receive the attestation
  data: string;        // ABI-encoded attestation data
  signature: string;   // Compact signature (r + s + v)
  revocable: boolean;  // Whether the attestation can be revoked
  refUID: string;      // Referenced attestation UID (zero if none)
}

/**
 * Delegated attestation data for submission.
 */
export interface DelegatedAttestationData {
  signature: string;   // Compact signature for delegation
  attester: string;    // Address of the delegated attester
  deadline: number;    // Unix timestamp deadline for submission
  nonce: number;       // Nonce used in signature (needed for verification & submission)
}

/**
 * Result type from signing functions.
 */
export interface SigningResult {
  attestation: AttestationData;
  delegatedAttestation: DelegatedAttestationData;
}

// ============================================
// Error Types
// ============================================

/**
 * RFC 7807 Problem Details for error responses.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}
