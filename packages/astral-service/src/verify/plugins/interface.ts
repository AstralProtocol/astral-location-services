/**
 * Plugin Interface for Location Verification
 *
 * Service-side plugin interface. Aligned with the canonical
 * LocationProofPlugin interface in @decentralized-geo/astral-sdk/plugins.
 *
 * The service only uses verify() and evaluate(). Client-side methods
 * (collect, create, sign) are handled by plugin packages directly.
 */

import type {
  LocationStamp,
  LocationClaim,
  StampVerificationResult,
} from '../types/index.js';

/**
 * Credibility vector — how well a stamp supports a claim.
 *
 * Aligned with CredibilityVector from the SDK. The service uses this
 * as the output of plugin.evaluate().
 */
export interface CredibilityVector {
  /** Does the stamp support the claim? */
  supportsClaim: boolean;

  /** Overall support score (0-1) */
  score: number;

  /** Spatial overlap score (0-1) */
  spatial: number;

  /** Temporal overlap score (0-1) */
  temporal: number;

  /** Plugin-specific evaluation details */
  details: Record<string, unknown>;
}

/**
 * Plugin interface for location verification.
 *
 * Server-side plugins implement verify() and evaluate().
 * This is the service-side subset of the SDK's LocationProofPlugin.
 */
export interface LocationProofPlugin {
  /** Plugin name (e.g., "proofmode", "witnesschain") */
  readonly name: string;

  /** Plugin version (semver) */
  readonly version: string;

  /** Environments where this plugin operates */
  readonly environments: string[];

  /** Human-readable description */
  readonly description: string;

  /**
   * Verify a stamp's internal validity.
   *
   * Checks:
   * - Signature validity
   * - Structure validity
   * - Signal consistency
   *
   * This is plugin-specific because different evidence types
   * have different validity requirements.
   */
  verify(stamp: LocationStamp): Promise<StampVerificationResult>;

  /**
   * Evaluate how well a stamp supports a claim.
   *
   * This is a probabilistic evaluation, not a simple geometric intersection.
   * Produces a credibility vector — the evidence function E(C, E) → P.
   */
  evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<CredibilityVector>;
}

/**
 * Plugin metadata for listing available plugins.
 */
export interface PluginMetadata {
  name: string;
  version: string;
  environments: string[];
  description: string;
}

/**
 * Extract metadata from a plugin instance.
 */
export function getPluginMetadata(plugin: LocationProofPlugin): PluginMetadata {
  return {
    name: plugin.name,
    version: plugin.version,
    environments: plugin.environments,
    description: plugin.description,
  };
}
