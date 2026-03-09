/**
 * WiFi MLS Verification Logic
 *
 * MVP implementation - validates structure, WiFi signals, and ECDSA signatures.
 * Future: AP MAC address spoofing detection, MLS response freshness checks.
 *
 * Signal shape (from plugin-wifi-mls/src/create.ts):
 *   { source: 'wifi', accuracyMeters, apCount }
 *
 * // MVP SIMPLIFICATION: No AP MAC address spoofing detection.
 * // PROVISIONAL: Validity dimensions will evolve — see CredibilityVector roadmap.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';
import { computeDistance, computeTemporalOverlap, checkBaseStructure, checkSignatures } from '../geo-utils.js';

// ============================================
// Verification
// ============================================

/**
 * Verify a WiFi MLS stamp's internal validity.
 *
 * Checks:
 * 1. Structure: LP v0.2, plugin name "wifi-mls", GeoJSON Point, temporalFootprint
 * 2. Signals: source, accuracyMeters, apCount (real plugin-wifi-mls output shape)
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: apCount >= 1, accuracyMeters > 0, coordinates in range
 */
export async function verifyWifiMlsStamp(stamp: LocationStamp): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};

  const structureValid = checkBaseStructure(stamp, 'wifi-mls', details);
  const signaturesValid = await checkSignatures(stamp, details);
  // MVP SIMPLIFICATION: No AP MAC address spoofing detection.
  const signalsConsistent = checkSignalConsistency(stamp, details);

  const valid = structureValid && signaturesValid && signalsConsistent;

  return { valid, signaturesValid, structureValid, signalsConsistent, details };
}

// ============================================
// Evaluation
// ============================================

/**
 * Evaluate a WiFi MLS stamp against a location claim.
 *
 * Returns raw measurements. Uses MLS accuracyMeters for radius check.
 *
 * // PROVISIONAL: Evaluation dimensions will evolve — see CredibilityVector roadmap.
 */
export async function evaluateWifiMlsStamp(
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
  details.apCount = getApCount(stamp);

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

  const apCount = stamp.signals.apCount as number | undefined;
  if (typeof apCount !== 'number' || apCount <= 0) {
    details.invalidApCount = true;
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
    details.signalChecks = { apCount, accuracyMeters, coordinatesValid: true };
  }
  return valid;
}

function getApCount(stamp: LocationStamp): number {
  const apCount = stamp.signals?.apCount as number | undefined;
  return typeof apCount === 'number' ? apCount : 0;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const accuracyMeters = stamp.signals?.accuracyMeters as number | undefined;
  if (typeof accuracyMeters === 'number' && accuracyMeters > 0) return accuracyMeters;
  return 100; // Default WiFi MLS accuracy estimate
}
