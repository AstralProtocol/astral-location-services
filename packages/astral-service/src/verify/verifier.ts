/**
 * Main Verification Orchestrator
 *
 * Coordinates the verification flow:
 * 1. Verify each stamp independently
 * 2. Evaluate stamps against the claim (raw measurements)
 * 3. Aggregate into CredibilityVector dimensions
 */

import type {
  LocationStamp,
  LocationProof,
  StampResult,
  StampVerificationResult,
  CredibilityVector,
} from './types/index.js';
import { getPlugin } from './plugins/index.js';
import { buildCredibilityVector } from './assessment.js';

/**
 * Verify a stamp's internal validity (no claim evaluation).
 *
 * This is used by the POST /verify/v0/stamp endpoint.
 */
export async function verifyStamp(stamp: LocationStamp): Promise<StampVerificationResult> {
  const plugin = getPlugin(stamp.plugin);
  return plugin.verify(stamp);
}

/**
 * Verify a location proof (claim + stamps).
 *
 * Returns a CredibilityVector with multidimensional assessment —
 * no summary scores. Consumers apply their own thresholds.
 */
export async function verifyProof(proof: LocationProof): Promise<CredibilityVector> {
  const { claim, stamps } = proof;

  // Verify and evaluate each stamp in parallel
  const stampResults = await Promise.all(
    stamps.map((stamp, index) => verifyAndEvaluateStamp(stamp, claim, index))
  );

  // Build CredibilityVector from raw stamp measurements
  return buildCredibilityVector(stampResults);
}

/**
 * Verify a single stamp and evaluate it against a claim.
 *
 * Combines plugin.verify() (internal validity) with plugin.evaluate()
 * (raw measurements) into a single StampResult.
 */
async function verifyAndEvaluateStamp(
  stamp: LocationStamp,
  claim: LocationProof['claim'],
  stampIndex: number
): Promise<StampResult> {
  const plugin = getPlugin(stamp.plugin);

  // Verify stamp internal validity
  const verification = await plugin.verify(stamp);

  // Evaluate stamp against claim (even if invalid — provides context)
  const evaluation = await plugin.evaluate(stamp, claim);

  return {
    stampIndex,
    plugin: stamp.plugin,

    // From verification
    signaturesValid: verification.signaturesValid,
    structureValid: verification.structureValid,
    signalsConsistent: verification.signalsConsistent,

    // From evaluation (raw measurements)
    distanceMeters: evaluation.distanceMeters,
    temporalOverlap: evaluation.temporalOverlap,
    withinRadius: evaluation.withinRadius,

    // Combined plugin output
    details: {
      verification: verification.details,
      evaluation: evaluation.details,
    },
  };
}
