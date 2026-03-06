/**
 * GeoClue Verification Logic
 *
 * MVP implementation - validates structure, GeoClue2 signals, and ECDSA signatures.
 * Future: Cross-reference source type with expected accuracy ranges.
 *
 * // MVP SIMPLIFICATION: Trusts GeoClue2 system accuracy estimate without independent verification.
 * // PROVISIONAL: Validity dimensions will evolve — see CredibilityVector roadmap.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';
import { computeDistance, computeTemporalOverlap, checkBaseStructure, checkSignatures } from '../geo-utils.js';

// ============================================
// Verification
// ============================================

/**
 * Verify a GeoClue stamp's internal validity.
 *
 * Checks:
 * 1. Structure: LP v0.2, plugin name "geoclue", GeoJSON Point, temporalFootprint
 * 2. Signals: accuracy (meters), source (gps/wifi/cell/ip), altitude optional
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: accuracy > 0, coordinates within valid ranges
 */
export async function verifyGeoclueStamp(stamp: LocationStamp): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};

  const structureValid = checkBaseStructure(stamp, 'geoclue', details);
  const signaturesValid = await checkSignatures(stamp, details);
  // MVP SIMPLIFICATION: Trusts GeoClue2 system accuracy estimate without independent verification.
  const signalsConsistent = checkSignalConsistency(stamp, details);

  const valid = structureValid && signaturesValid && signalsConsistent;

  return { valid, signaturesValid, structureValid, signalsConsistent, details };
}

// ============================================
// Evaluation
// ============================================

/**
 * Evaluate a GeoClue stamp against a location claim.
 *
 * Returns raw measurements. Uses GeoClue accuracy for radius check.
 *
 * // PROVISIONAL: Evaluation dimensions will evolve — see CredibilityVector roadmap.
 */
export async function evaluateGeoclueStamp(
  stamp: LocationStamp,
  claim: LocationClaim
): Promise<StampEvaluation> {
  const details: Record<string, unknown> = {};

  const distanceMeters = computeDistance(stamp, claim, details);
  const temporalOverlap = computeTemporalOverlap(stamp, claim, details);

  const stampAccuracy = getStampAccuracy(stamp);
  const effectiveRadius = claim.radius + stampAccuracy;
  const withinRadius = distanceMeters <= effectiveRadius;
  details.claimRadius = claim.radius;
  details.stampAccuracy = stampAccuracy;
  details.effectiveRadius = effectiveRadius;

  return { distanceMeters, temporalOverlap, withinRadius, details };
}

// ============================================
// Plugin-Specific Helpers
// ============================================

const VALID_SOURCES = ['gps', 'wifi', 'cell', 'ip'];

function checkSignalConsistency(stamp: LocationStamp, details: Record<string, unknown>): boolean {
  if (!stamp.signals) return false;

  const accuracy = stamp.signals.accuracy as number | undefined;
  if (typeof accuracy !== 'number' || accuracy <= 0) {
    details.signalError = `Accuracy must be > 0 (got ${accuracy})`;
    return false;
  }

  const source = stamp.signals.source as string | undefined;
  if (!source || !VALID_SOURCES.includes(source)) {
    details.signalError = `Source must be one of ${VALID_SOURCES.join(', ')} (got '${source}')`;
    return false;
  }

  if (typeof stamp.location === 'object' && 'type' in stamp.location && stamp.location.type === 'Point') {
    const coords = stamp.location.coordinates as [number, number];
    const [lon, lat] = coords;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      details.signalError = `Coordinates out of range: [${lon}, ${lat}]`;
      return false;
    }
  }

  details.signalChecks = { accuracy, source, coordinatesValid: true };
  return true;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const accuracy = stamp.signals?.accuracy as number | undefined;
  if (typeof accuracy === 'number' && accuracy > 0) return accuracy;
  return 50; // Default GeoClue accuracy estimate
}
