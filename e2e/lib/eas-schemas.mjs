/**
 * EAS Schema definitions and decode helpers.
 * Ported from packages/astral-service/src/core/signing/schemas.ts
 */
import { AbiCoder } from 'ethers';

// Schema strings
export const NUMERIC_POLICY_SCHEMA =
  'uint256 result, string units, bytes32[] inputRefs, uint256 timestamp, string operation';

export const BOOLEAN_POLICY_SCHEMA =
  'bool result, bytes32[] inputRefs, uint256 timestamp, string operation';

export const VERIFY_SCHEMA =
  'bytes32 claim_hash, bytes32 proof_hash, uint8 confidence, string credibility_uri';

// ABI tuple types for decoding
const NUMERIC_TYPES = ['uint256', 'string', 'bytes32[]', 'uint256', 'string'];
const BOOLEAN_TYPES = ['bool', 'bytes32[]', 'uint256', 'string'];
const VERIFY_TYPES = ['bytes32', 'bytes32', 'uint8', 'string'];

// Units
export const UNITS = {
  CENTIMETERS: 'centimeters',
  SQUARE_CENTIMETERS: 'square_centimeters',
  METERS: 'meters',
  SQUARE_METERS: 'square_meters',
};

// Scale factors
export const SCALE_FACTORS = {
  DISTANCE: 100n,
  AREA: 10000n,
  LENGTH: 100n,
};

const coder = AbiCoder.defaultAbiCoder();

/**
 * Decode a numeric attestation (distance, area, length).
 * @param {string} data - Hex-encoded attestation data
 * @returns {{ result: bigint, units: string, inputRefs: string[], timestamp: bigint, operation: string }}
 */
export function decodeNumericAttestation(data) {
  const decoded = coder.decode(NUMERIC_TYPES, data);
  return {
    result: decoded[0],
    units: decoded[1],
    inputRefs: decoded[2],
    timestamp: decoded[3],
    operation: decoded[4],
  };
}

/**
 * Decode a boolean attestation (contains, within, intersects).
 * @param {string} data - Hex-encoded attestation data
 * @returns {{ result: boolean, inputRefs: string[], timestamp: bigint, operation: string }}
 */
export function decodeBooleanAttestation(data) {
  const decoded = coder.decode(BOOLEAN_TYPES, data);
  return {
    result: decoded[0],
    inputRefs: decoded[1],
    timestamp: decoded[2],
    operation: decoded[3],
  };
}

/**
 * Decode a verify attestation.
 * @param {string} data - Hex-encoded attestation data
 * @returns {{ claimHash: string, proofHash: string, confidence: number, credibilityUri: string }}
 */
export function decodeVerifyAttestation(data) {
  const decoded = coder.decode(VERIFY_TYPES, data);
  return {
    claimHash: decoded[0],
    proofHash: decoded[1],
    confidence: decoded[2],
    credibilityUri: decoded[3],
  };
}
