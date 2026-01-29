import { keccak256, toUtf8Bytes } from 'ethers';
import stableStringify from 'fast-json-stable-stringify';
import type { Input, ResolvedInput, RawGeometryInput } from '../types/index.js';
import { isRawGeometry, isOnchainInput, isOffchainInput } from '../types/index.js';

/**
 * Resolve an input to a geometry and reference.
 *
 * For MVP, only raw GeoJSON is supported.
 * Future: Add EAS fetching for onchain UIDs and URI fetching for offchain attestations.
 */
export async function resolveInput(input: Input): Promise<ResolvedInput> {
  if (isRawGeometry(input)) {
    return resolveRawGeometry(input);
  }

  if (isOnchainInput(input)) {
    // TODO: Phase 2 - Fetch from EAS contract
    throw new Error('Onchain UID resolution not yet implemented');
  }

  if (isOffchainInput(input)) {
    // TODO: Phase 2 - Fetch from URI and verify signature
    throw new Error('Offchain attestation resolution not yet implemented');
  }

  throw new Error('Invalid input format');
}

/**
 * Resolve raw GeoJSON geometry.
 * Computes keccak256 hash of the geometry as the reference.
 */
function resolveRawGeometry(geometry: RawGeometryInput): ResolvedInput {
  // Canonical JSON serialization for consistent hashing
  // Uses fast-json-stable-stringify which handles deep key sorting
  const canonical = stableStringify(geometry);
  const ref = keccak256(toUtf8Bytes(canonical));

  return {
    geometry,
    ref,
  };
}

/**
 * Resolve multiple inputs in parallel.
 */
export async function resolveInputs(inputs: Input[]): Promise<ResolvedInput[]> {
  return Promise.all(inputs.map(resolveInput));
}
