/**
 * EAS Schema definitions for Astral Policy Attestations
 */

// Numeric policy attestation schema (for distance, area, length)
// Result is scaled to integer (e.g., centimeters for distance)
// Note: timestamp is uint256 to match registered schemas on EAS
export const NUMERIC_POLICY_SCHEMA =
  'uint256 result, string units, bytes32[] inputRefs, uint256 timestamp, string operation';

// Boolean policy attestation schema (for contains, within, intersects)
// Note: timestamp is uint256 to match registered schemas on EAS
export const BOOLEAN_POLICY_SCHEMA =
  'bool result, bytes32[] inputRefs, uint256 timestamp, string operation';

// Unit strings for numeric attestations
export const UNITS = {
  CENTIMETERS: 'centimeters',
  SQUARE_CENTIMETERS: 'square_centimeters',
  METERS: 'meters',
  SQUARE_METERS: 'square_meters',
} as const;

// Scale factors for converting to uint256
export const SCALE_FACTORS = {
  // Distance: meters to centimeters (multiply by 100)
  DISTANCE: 100n,
  // Area: square meters to square centimeters (multiply by 10000)
  AREA: 10000n,
  // Length: meters to centimeters (multiply by 100)
  LENGTH: 100n,
} as const;

/**
 * Scale a numeric result to uint256 for attestation encoding.
 */
export function scaleToUint256(value: number, scaleFactor: bigint): bigint {
  // Convert to integer with scale factor
  // value is already rounded to appropriate precision
  return BigInt(Math.round(value * Number(scaleFactor)));
}
