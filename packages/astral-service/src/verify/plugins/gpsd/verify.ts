/**
 * GPSD Verification Logic
 *
 * MVP implementation - validates structure, GPS signals, and ECDSA signatures.
 * Future: GPS signal replay detection, ephemeris validation.
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
 * 1. Structure: LP v0.2, plugin name, GeoJSON Point, temporalFootprint
 * 2. Signals: fix object with mode, lat, lon, alt, satellites
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: fix mode >= 2, satellite count > 0
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
 * Uses reported accuracy (HDOP-derived or fix accuracy field) for radius check.
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

  const fix = stamp.signals.fix as Record<string, unknown> | undefined;
  if (!fix) {
    details.signalError = 'Missing fix object in signals';
    return false;
  }

  const requiredFields = ['mode', 'lat', 'lon', 'alt', 'satellites'];
  const missingFields = requiredFields.filter(f => fix[f] === undefined);
  if (missingFields.length > 0) {
    details.signalError = `Missing fix fields: ${missingFields.join(', ')}`;
    return false;
  }

  const mode = fix.mode as number;
  if (typeof mode !== 'number' || mode < 2) {
    details.signalError = `Fix mode must be >= 2 (got ${mode})`;
    return false;
  }

  const satellites = fix.satellites as number;
  if (typeof satellites !== 'number' || satellites <= 0) {
    details.signalError = `Satellite count must be > 0 (got ${satellites})`;
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

  details.signalChecks = { fixMode: mode, satellites, hasRequiredFields: true };
  return true;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const fix = stamp.signals?.fix as Record<string, unknown> | undefined;
  if (fix?.accuracy && typeof fix.accuracy === 'number') return fix.accuracy;
  return 10; // Default GPS accuracy estimate
}
