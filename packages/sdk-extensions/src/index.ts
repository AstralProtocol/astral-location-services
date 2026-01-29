// Main SDK exports
export { AstralCompute, createAstralCompute } from './compute.js';
export {
  AstralEAS,
  createAstralEAS,
  submitDelegatedAttestation,
  submitFromApiResponse,
  splitSignature,
  type AttestationResult,
  type SubmitFromApiResponseOptions,
} from './eas.js';

// Type exports
export type {
  Input,
  RawGeometryInput,
  OnchainInput,
  OffchainInput,
  ComputeOptions,
  DelegatedAttestation,
  DelegatedAttestationMessage,
  DelegatedAttestationSignature,
  AttestationObject,
  DelegatedAttestationObject,
  NumericComputeResult,
  BooleanComputeResult,
  ComputeResult,
  AstralComputeConfig,
  SubmitDelegatedOptions,
} from './types.js';

/**
 * Astral Location Services SDK
 *
 * @example
 * ```typescript
 * import { createAstralCompute, createAstralEAS } from '@decentralized-geo/astral-compute';
 *
 * // Initialize compute client
 * const astral = createAstralCompute({
 *   apiUrl: 'https://compute.astral.global',
 *   chainId: 8453, // Base Mainnet
 * });
 *
 * // Compute distance with signed attestation
 * const result = await astral.distance(
 *   { type: 'Point', coordinates: [-122.4194, 37.7749] },
 *   { type: 'Point', coordinates: [-73.9857, 40.7484] },
 *   {
 *     schema: '0x...',
 *     recipient: '0x...',
 *   }
 * );
 *
 * console.log(`Distance: ${result.result.value} ${result.result.units}`);
 *
 * // Submit attestation to EAS
 * const eas = createAstralEAS(signer, 8453);
 * const receipt = await eas.submitDelegated(result.attestation);
 * ```
 */
