/**
 * Confidence Assessment for Location Proofs
 *
 * Computes overall confidence from stamp results and correlation analysis.
 * Based on the evidence evaluation framework from "Towards Stronger Location Proofs".
 *
 * Key principles:
 * - Independent, corroborating evidence increases confidence
 * - Redundant evidence from the same system neither adds nor subtracts
 * - Invalid stamps reduce overall confidence
 */

import type {
  StampResult,
  CorrelationAssessment,
  CredibilityAssessment,
} from './types/index.js';

// ============================================
// Confidence Calculation Constants
// ============================================

/** Single stamp cannot exceed 85% confidence without corroboration from other sources */
const MAX_SINGLE_STAMP_CONFIDENCE = 0.85;

/** Minimum confidence for invalid stamps (provides some signal that verification was attempted) */
const INVALID_STAMP_CONFIDENCE = 0.1;

/** Penalty multiplier when signals are inconsistent */
const INCONSISTENT_SIGNALS_PENALTY = 0.8;

/** Independence must exceed 50% to receive a bonus */
const INDEPENDENCE_BONUS_THRESHOLD = 0.5;

/** Maximum bonus from independence (10% when fully independent) */
const INDEPENDENCE_BONUS_MULTIPLIER = 0.2;

/** Agreement must exceed 70% to receive a bonus */
const AGREEMENT_BONUS_THRESHOLD = 0.7;

/** Maximum bonus from agreement (4.5% when perfect agreement) */
const AGREEMENT_BONUS_MULTIPLIER = 0.15;

/** Penalty per invalid stamp in multi-stamp proofs */
const INVALID_STAMP_PENALTY = 0.05;

/**
 * Compute overall confidence from stamp results and correlation.
 *
 * The confidence calculation incorporates:
 * - Stamp validity (did each stamp pass internal verification?)
 * - Claim support scores (how well does each stamp support the claim?)
 * - Independence (are evidence sources uncorrelated?)
 * - Agreement (do sources agree with each other?)
 *
 * Note: This is a heuristic, not a calibrated probability.
 */
export function computeConfidence(
  stampResults: StampResult[],
  correlation?: CorrelationAssessment
): number {
  if (stampResults.length === 0) {
    return 0;
  }

  // Single stamp case
  if (stampResults.length === 1) {
    return computeSingleStampConfidence(stampResults[0]);
  }

  // Multi-stamp case
  return computeMultiStampConfidence(stampResults, correlation);
}

/**
 * Compute confidence for a single stamp.
 */
function computeSingleStampConfidence(result: StampResult): number {
  // If stamp is invalid, confidence is very low
  if (!result.signaturesValid || !result.structureValid) {
    return INVALID_STAMP_CONFIDENCE;
  }

  // Base confidence from claim support score
  let confidence = result.claimSupportScore;

  // Penalty for inconsistent signals
  if (!result.signalsConsistent) {
    confidence *= INCONSISTENT_SIGNALS_PENALTY;
  }

  // Cap single stamp confidence (multi-stamp can exceed via bonuses)
  return Math.min(confidence, MAX_SINGLE_STAMP_CONFIDENCE);
}

/**
 * Compute confidence for multiple stamps with correlation analysis.
 */
function computeMultiStampConfidence(
  stampResults: StampResult[],
  correlation?: CorrelationAssessment
): number {
  // Count valid and invalid stamps
  const validResults = stampResults.filter(
    (r) => r.signaturesValid && r.structureValid && r.supportsClaim
  );
  const invalidCount = stampResults.length - validResults.length;

  if (validResults.length === 0) {
    return INVALID_STAMP_CONFIDENCE;
  }

  // Base confidence: average of valid stamp support scores
  const baseConfidence =
    validResults.reduce((sum, r) => sum + r.claimSupportScore, 0) /
    validResults.length;

  // Independence bonus (if stamps from different systems)
  let independenceBonus = 0;
  if (correlation && correlation.independence > INDEPENDENCE_BONUS_THRESHOLD) {
    independenceBonus = (correlation.independence - INDEPENDENCE_BONUS_THRESHOLD) * INDEPENDENCE_BONUS_MULTIPLIER;
  }

  // Agreement bonus (if stamps corroborate each other)
  let agreementBonus = 0;
  if (correlation && correlation.agreement > AGREEMENT_BONUS_THRESHOLD) {
    agreementBonus = (correlation.agreement - AGREEMENT_BONUS_THRESHOLD) * AGREEMENT_BONUS_MULTIPLIER;
  }

  // Invalid stamp penalty
  const invalidPenalty = invalidCount * INVALID_STAMP_PENALTY;

  // Compute final confidence
  const confidence = baseConfidence + independenceBonus + agreementBonus - invalidPenalty;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Build a complete credibility assessment from verification results.
 */
export function buildCredibilityAssessment(
  stampResults: StampResult[],
  correlation?: CorrelationAssessment
): CredibilityAssessment {
  const confidence = computeConfidence(stampResults, correlation);

  return {
    confidence,
    stampResults,
    correlation,
  };
}

/**
 * Scale confidence (0-1) to uint8 (0-100) for EAS attestation.
 */
export function scaleConfidenceToUint8(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}
