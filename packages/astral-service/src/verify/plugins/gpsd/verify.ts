/**
 * GPSD Verification Logic
 *
 * MVP implementation - validates structure, GPS signals, and ECDSA signatures.
 * Future: GPS signal replay detection, ephemeris validation.
 *
 * Signal shape (from plugin-gpsd/src/create.ts):
 *   { source: 'gpsd', accuracyMeters, mode, altitudeMeters?, speedMs? }
 *
 * // MVP SIMPLIFICATION: No GPS signal replay detection. Trusts raw NMEA data.
 * // PROVISIONAL: Validity dimensions will evolve — see CredibilityVector roadmap.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';
import { computeDistance, computeTemporalOverlap, checkBaseStructure, checkSignatures } from '../geo-utils.js';

// ============================================
// Verification
// ============================================

/**
 * Verify a GPSD stamp's internal validity.
 *
 * Checks:
 * 1. Structure: LP v0.2, plugin name "gpsd", GeoJSON Point, temporalFootprint
 * 2. Signals: source, accuracyMeters, mode (real plugin-gpsd output shape)
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: mode >= 2, accuracyMeters > 0, coordinates in range
 */
export async function verifyGpsdStamp(stamp: LocationStamp): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};

  const structureValid = checkBaseStructure(stamp, 'gpsd', details);
  const signaturesValid = await checkSignatures(stamp, details);
  // MVP SIMPLIFICATION: No GPS signal replay detection. Trusts raw NMEA data.
  const signalsConsistent = checkSignalConsistency(stamp, details);

  const valid = structureValid && signaturesValid && signalsConsistent;

  return { valid, signaturesValid, structureValid, signalsConsistent, details };
}

// ============================================
// Evaluation
// ============================================

/**
 * Evaluate a GPSD stamp against a location claim.
 *
 * Returns raw measurements (distance, temporal overlap, within-radius).
 * Uses reported accuracyMeters for radius check.
 *
 * // PROVISIONAL: Evaluation dimensions will evolve — see CredibilityVector roadmap.
 */
export async function evaluateGpsdStamp(
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

  const mode = stamp.signals.mode as number | undefined;
  if (typeof mode !== 'number' || (mode !== 2 && mode !== 3)) {
    details.invalidFixMode = true;
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
    details.signalChecks = { mode, accuracyMeters, coordinatesValid: true };
  }
  return valid;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const accuracyMeters = stamp.signals?.accuracyMeters as number | undefined;
  if (typeof accuracyMeters === 'number' && accuracyMeters > 0) return accuracyMeters;
  return 10; // Default GPS accuracy estimate
}
