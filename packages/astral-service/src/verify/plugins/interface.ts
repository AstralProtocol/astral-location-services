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
 * Raw measurements from evaluating a stamp against a claim.
 *
 * Renamed from CredibilityVector to avoid collision with the SDK's
 * aggregate CredibilityVector type. No opinionated scores — the verifier
 * passes these measurements through to StampResult, and the assessment
 * module aggregates them into CredibilityVector dimensions.
 */
export interface StampEvaluation {
  /** Haversine distance from stamp location to claim location (meters) */
  distanceMeters: number;

  /** Fraction of stamp/claim time windows that overlap (0-1) */
  temporalOverlap: number;

  /** Is the stamp within the claim's radius (accounting for stamp accuracy)? */
  withinRadius: boolean;

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
   * Evaluate a stamp against a claim and return raw measurements.
   *
   * Returns distance, temporal overlap, and within-radius — no scores.
   * The verifier and assessment modules handle aggregation.
   */
  evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<StampEvaluation>;
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
