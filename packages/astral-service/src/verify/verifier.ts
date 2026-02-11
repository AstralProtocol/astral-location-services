/**
 * Main Verification Orchestrator
 *
 * Coordinates the verification flow:
 * 1. Verify each stamp independently
 * 2. Evaluate stamps against the claim
 * 3. Analyze cross-correlation (for multi-stamp proofs)
 * 4. Compute overall credibility assessment
 */

import type {
  LocationStamp,
  LocationProof,
  StampResult,
  StampVerificationResult,
  CredibilityAssessment,
} from './types/index.js';
import { getPlugin } from './plugins/index.js';
import { analyzeCorrelation } from './correlation.js';
import { buildCredibilityAssessment } from './assessment.js';

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
 * This is the main verification flow:
 * 1. Verify each stamp internally
 * 2. Evaluate each stamp against the claim
 * 3. Analyze cross-correlation (multi-stamp only)
 * 4. Build credibility assessment
 */
export async function verifyProof(proof: LocationProof): Promise<CredibilityAssessment> {
  const { claim, stamps } = proof;

  // Verify and evaluate each stamp in parallel
  const stampResults = await Promise.all(
    stamps.map((stamp, index) => verifyAndEvaluateStamp(stamp, claim, index))
  );

  // Analyze correlation for multi-stamp proofs
  const correlation = analyzeCorrelation(stamps, stampResults);

  // Build credibility assessment
  return buildCredibilityAssessment(stampResults, correlation);
}

/**
 * Verify a single stamp and evaluate it against a claim.
 *
 * Combines the verify and evaluate steps into a single StampResult.
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

    // From evaluation
    supportsClaim: evaluation.supportsClaim,
    claimSupportScore: evaluation.score,

    // Combined plugin output
    pluginResult: {
      verification: verification.details,
      evaluation: evaluation.details,
      spatial: evaluation.spatial,
      temporal: evaluation.temporal,
    },
  };
}
