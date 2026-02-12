/**
 * Cross-Correlation Analysis for Multi-Stamp Proofs
 *
 * Analyzes relationships between stamps from different sources:
 * - Independence: Are stamps from different systems?
 * - Agreement: Do spatial/temporal footprints align?
 *
 * Key principle: Independent, corroborating evidence increases confidence.
 * Redundant evidence from the same system doesn't add confidence.
 */

import type { LocationStamp, StampResult } from './types/index.js';

/**
 * @deprecated This module is unused since the CredibilityVector builder
 * computes independence dimensions directly from stamp results.
 * Kept for reference — may be removed in a future cleanup.
 */

interface CorrelationAssessment {
  independence: number;
  agreement: number;
  notes: string[];
}

/**
 * Analyze correlation between multiple stamps.
 *
 * Returns undefined for single-stamp proofs (no correlation to analyze).
 */
export function analyzeCorrelation(
  stamps: LocationStamp[],
  stampResults: StampResult[]
): CorrelationAssessment | undefined {
  if (stamps.length < 2) {
    return undefined;
  }

  const notes: string[] = [];

  // Calculate independence
  const independence = calculateIndependence(stamps, notes);

  // Calculate agreement
  const agreement = calculateAgreement(stamps, stampResults, notes);

  return {
    independence,
    agreement,
    notes,
  };
}

/**
 * Calculate independence score based on plugin diversity.
 *
 * Higher score = more independent evidence sources.
 * Stamps from different plugins are considered independent.
 * Stamps from the same plugin are redundant.
 */
function calculateIndependence(stamps: LocationStamp[], notes: string[]): number {
  // Count unique plugins
  const plugins = new Set(stamps.map((s) => s.plugin));
  const uniquePlugins = plugins.size;
  const totalStamps = stamps.length;

  // Independence = ratio of unique plugins to total stamps
  // Max out at 1.0 when all stamps are from different plugins
  const independence = uniquePlugins / totalStamps;

  if (uniquePlugins === totalStamps) {
    notes.push(`All ${totalStamps} stamps from different plugins (high independence)`);
  } else if (uniquePlugins === 1) {
    notes.push(`All stamps from same plugin '${Array.from(plugins)[0]}' (low independence)`);
  } else {
    notes.push(`${uniquePlugins} unique plugins across ${totalStamps} stamps`);
  }

  return independence;
}

/**
 * Calculate agreement score based on stamp results and temporal overlap.
 *
 * Higher score = stamps corroborate each other.
 * Considers:
 * - Claim support consistency across stamps
 * - Temporal footprint overlap
 */
function calculateAgreement(
  stamps: LocationStamp[],
  stampResults: StampResult[],
  notes: string[]
): number {
  // Filter to valid stamps only
  const validResults = stampResults.filter(
    (r) => r.signaturesValid && r.structureValid
  );

  if (validResults.length < 2) {
    notes.push('Insufficient valid stamps for agreement analysis');
    return 0.5; // Neutral score
  }

  // Agreement based on distance consistency (lower variance = higher agreement)
  const distances = validResults.map((r) => r.distanceMeters).filter(isFinite);
  const scoreVariance = distances.length > 0 ? calculateVariance(distances) : 0;

  // Lower variance = higher agreement (stamps give similar scores)
  // Normalize: variance of 0 -> agreement 1.0, variance of 0.25 -> agreement 0.5
  const scoreAgreement = Math.max(0, 1 - scoreVariance * 4);

  // Temporal overlap between stamps
  const temporalAgreement = calculateTemporalAgreement(stamps);

  // Combined agreement (weighted average)
  const agreement = scoreAgreement * 0.6 + temporalAgreement * 0.4;

  if (agreement > 0.8) {
    notes.push('Strong agreement between stamps');
  } else if (agreement > 0.5) {
    notes.push('Moderate agreement between stamps');
  } else {
    notes.push('Low agreement between stamps');
  }

  return agreement;
}

/**
 * Calculate temporal agreement across stamps.
 *
 * Higher score = temporal footprints overlap significantly.
 */
function calculateTemporalAgreement(stamps: LocationStamp[]): number {
  if (stamps.length < 2) return 1.0;

  // Find the intersection of all temporal footprints
  let intersectStart = stamps[0].temporalFootprint.start;
  let intersectEnd = stamps[0].temporalFootprint.end;

  for (let i = 1; i < stamps.length; i++) {
    intersectStart = Math.max(intersectStart, stamps[i].temporalFootprint.start);
    intersectEnd = Math.min(intersectEnd, stamps[i].temporalFootprint.end);
  }

  // If no intersection, temporal agreement is 0
  if (intersectStart >= intersectEnd) {
    return 0;
  }

  // Calculate union of all temporal footprints
  let unionStart = stamps[0].temporalFootprint.start;
  let unionEnd = stamps[0].temporalFootprint.end;

  for (let i = 1; i < stamps.length; i++) {
    unionStart = Math.min(unionStart, stamps[i].temporalFootprint.start);
    unionEnd = Math.max(unionEnd, stamps[i].temporalFootprint.end);
  }

  // Intersection / Union ratio (Jaccard-like)
  const intersectDuration = intersectEnd - intersectStart;
  const unionDuration = unionEnd - unionStart;

  return unionDuration > 0 ? intersectDuration / unionDuration : 0;
}

/**
 * Calculate variance of a number array.
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
}
