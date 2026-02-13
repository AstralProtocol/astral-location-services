import { keccak256, toUtf8Bytes } from 'ethers';
import stableStringify from 'fast-json-stable-stringify';
import type { Input, ResolvedInput, RawGeometryInput, OnchainInput, VerifiedProofInput, ProofInputContext } from '../types/index.js';
import { isRawGeometry, isOnchainInput, isOffchainInput, isVerifiedProofInput } from '../types/index.js';
import { getAttestation, decodeLocationAttestation } from './eas-client.js';
import { Errors } from '../../core/middleware/error-handler.js';

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
  if (isVerifiedProofInput(input)) {
    return resolveVerifiedProofInput(input);
  }

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
  // Fetch attestation from EAS with proper error classification
  let attestation;
  try {
    attestation = await getAttestation(input.uid, chainId);
  } catch (error) {
    if (error instanceof Error) {
      // Classify common errors as client errors (400) rather than server errors (500)
      if (error.message.includes('not found')) {
        throw Errors.invalidInput(`Attestation not found: ${input.uid} on chain ${chainId}`);
      }
      if (error.message.includes('revoked')) {
        throw Errors.invalidInput(`Attestation has been revoked: ${input.uid}`);
      }
      if (error.message.includes('expired')) {
        throw Errors.invalidInput(`Attestation has expired: ${input.uid}`);
      }
      if (error.message.includes('Invalid attestation UID format')) {
        throw Errors.invalidInput(error.message);
      }
      if (error.message.includes('Unsupported chain')) {
        throw Errors.invalidInput(error.message);
      }
    }
    throw error;
  }

  // Decode the location protocol data
  let locationData;
  try {
    locationData = decodeLocationAttestation(attestation.data);
  } catch {
    throw Errors.invalidInput(
      `Failed to decode attestation ${input.uid}: not a valid Location Protocol attestation`
    );
  }

  // Check for empty location field
  if (!locationData.location || locationData.location.trim() === '') {
    throw Errors.invalidInput(`Attestation ${input.uid} has empty location field`);
  }

  // Parse the GeoJSON from the location field
  let parsed: unknown;
  try {
    parsed = JSON.parse(locationData.location);
  } catch {
    throw Errors.invalidInput(
      `Failed to parse GeoJSON from attestation ${input.uid}: invalid JSON in location field`
    );
  }

  // Handle GeoJSON Feature by extracting its geometry
  let geometry: RawGeometryInput;
  if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
    const geoObj = parsed as { type: string; geometry?: unknown };
    if (geoObj.type === 'Feature' && 'geometry' in geoObj && geoObj.geometry) {
      // Extract geometry from Feature
      geometry = geoObj.geometry as RawGeometryInput;
    } else {
      geometry = parsed as RawGeometryInput;
    }
  } else {
    throw Errors.invalidInput(
      `Invalid GeoJSON in attestation ${input.uid}: expected object with type property`
    );
  }

  // Validate it's a valid geometry type
  if (!isRawGeometry(geometry)) {
    throw Errors.invalidInput(
      `Invalid geometry type in attestation ${input.uid}: expected GeoJSON geometry, got ${(geometry as { type?: string }).type || 'unknown'}`
    );
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
 * Resolve a verified proof input to geometry.
 * Extracts claim geometry and attaches proof context for response enrichment.
 */
function resolveVerifiedProofInput(input: VerifiedProofInput): ResolvedInput {
  const { verifiedProof } = input;
  const { location } = verifiedProof.proof.claim;

  if (typeof location === 'string') {
    throw Errors.invalidInput(
      `Verified proof claim uses non-GeoJSON location format (got string: "${location.slice(0, 50)}"). ` +
      'Only GeoJSON geometry locations are supported for compute operations in v0.'
    );
  }

  const geometry = location as RawGeometryInput;
  if (!isRawGeometry(geometry)) {
    throw Errors.invalidInput(
      `Invalid geometry type in verified proof claim: expected GeoJSON geometry, got ${(geometry as { type?: string }).type || 'unknown'}`
    );
  }

  return {
    geometry,
    ref: verifiedProof.attestation.uid,
    proofContext: {
      ref: verifiedProof.attestation.uid,
      credibility: verifiedProof.credibility,
      claim: verifiedProof.proof.claim,
      evaluatedAt: verifiedProof.evaluatedAt,
      evaluationMethod: verifiedProof.evaluationMethod,
    },
  };
}

/**
 * Extract proof metadata from resolved inputs.
 * Collects ProofInputContext from any inputs that came from verified proofs.
 * Returns the first proof's attestation UID as refUID for EAS attestation linking.
 */
export function extractProofMetadata(resolvedInputs: ResolvedInput[]): {
  proofInputs: ProofInputContext[];
  refUID: string | undefined;
} {
  const proofInputs = resolvedInputs
    .filter((r): r is ResolvedInput & { proofContext: ProofInputContext } => r.proofContext !== undefined)
    .map(r => r.proofContext);

  // EAS attestations support a single refUID field.
  // When multiple inputs are verified proofs, we use the first proof's UID.
  // All proof contexts are still included in the response via proofInputs.
  const refUID = proofInputs.length > 0 ? proofInputs[0].ref : undefined;

  return { proofInputs, refUID };
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
