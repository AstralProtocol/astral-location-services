import { keccak256, toUtf8Bytes } from 'ethers';
import stableStringify from 'fast-json-stable-stringify';
import type { Input, ResolvedInput, RawGeometryInput, OnchainInput } from '../types/index.js';
import { isRawGeometry, isOnchainInput, isOffchainInput } from '../types/index.js';
import { getAttestation, decodeLocationAttestation } from './eas-client.js';

/**
 * Options for input resolution.
 */
export interface ResolveOptions {
  chainId: number;
}

/**
 * Resolve an input to a geometry and reference.
 *
 * Supports:
 * - Raw GeoJSON: Used directly, keccak256 hash as reference
 * - Onchain UID: Fetched from EAS, UID as reference
 * - Offchain attestation: Not yet implemented
 *
 * @param input - The input to resolve
 * @param options - Resolution options (chainId required for UID resolution)
 */
export async function resolveInput(input: Input, options?: ResolveOptions): Promise<ResolvedInput> {
  if (isRawGeometry(input)) {
    return resolveRawGeometry(input);
  }

  if (isOnchainInput(input)) {
    if (!options?.chainId) {
      throw new Error('chainId is required for onchain UID resolution');
    }
    return resolveOnchainInput(input, options.chainId);
  }

  if (isOffchainInput(input)) {
    // TODO: Phase 2 - Fetch from URI and verify signature
    throw new Error('Offchain attestation resolution not yet implemented');
  }

  throw new Error('Invalid input format');
}

/**
 * Resolve an onchain attestation UID to geometry.
 *
 * @param input - The onchain input with UID
 * @param chainId - The chain ID to query
 */
async function resolveOnchainInput(input: OnchainInput, chainId: number): Promise<ResolvedInput> {
  // Fetch attestation from EAS
  const attestation = await getAttestation(input.uid, chainId);

  // Decode the location protocol data
  const locationData = decodeLocationAttestation(attestation.data);

  // Parse the GeoJSON from the location field
  let geometry: RawGeometryInput;
  try {
    geometry = JSON.parse(locationData.location);
  } catch {
    throw new Error(`Failed to parse GeoJSON from attestation ${input.uid}: invalid JSON in location field`);
  }

  // Validate it's a valid geometry type
  if (!isRawGeometry(geometry)) {
    throw new Error(`Invalid geometry type in attestation ${input.uid}: expected GeoJSON geometry`);
  }

  return {
    geometry,
    ref: input.uid, // Use the attestation UID as the reference
  };
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
 *
 * @param inputs - Array of inputs to resolve
 * @param options - Resolution options (chainId required for UID resolution)
 */
export async function resolveInputs(inputs: Input[], options?: ResolveOptions): Promise<ResolvedInput[]> {
  return Promise.all(inputs.map(input => resolveInput(input, options)));
}
