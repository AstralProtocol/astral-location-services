/**
 * GeoClue Verification Logic
 *
 * MVP implementation - validates structure, GeoClue2 signals, and ECDSA signatures.
 * Future: Cross-reference source type with expected accuracy ranges.
 *
 * Signal shape (from plugin-geoclue/src/create.ts):
 *   { source: 'geoclue2', accuracyMeters, altitudeMeters?, platform: 'linux' }
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
 * 2. Signals: source, accuracyMeters, platform (real plugin-geoclue output shape)
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: accuracyMeters > 0, coordinates in range
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
 * Returns raw measurements. Uses GeoClue accuracyMeters for radius check.
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

function checkSignalConsistency(stamp: LocationStamp, details: Record<string, unknown>): boolean {
  if (!stamp.signals) return false;
  let valid = true;

  const accuracyMeters = stamp.signals.accuracyMeters as number | undefined;
  if (typeof accuracyMeters !== 'number' || accuracyMeters <= 0) {
    details.invalidAccuracy = true;
    valid = false;
  }

  const platform = stamp.signals.platform as string | undefined;
  if (platform !== 'linux') {
    details.invalidPlatform = true;
    valid = false;
  }

  if (typeof stamp.location === 'object' && 'type' in stamp.location && stamp.location.type === 'Point') {
    const coords = stamp.location.coordinates as [number, number];
    const [lon, lat] = coords;
    if (lat < -90 || lat > 90) {
      details.invalidLatitude = true;
      valid = false;
    }
    if (lon < -180 || lon > 180) {
      details.invalidLongitude = true;
      valid = false;
    }
  }

  if (valid) {
    details.signalChecks = { accuracyMeters, platform, coordinatesValid: true };
  }
  return valid;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const accuracyMeters = stamp.signals?.accuracyMeters as number | undefined;
  if (typeof accuracyMeters === 'number' && accuracyMeters > 0) return accuracyMeters;
  return 50; // Default GeoClue accuracy estimate
}
