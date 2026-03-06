/**
 * WiFi MLS Verification Logic
 *
 * MVP implementation - validates structure, WiFi AP signals, MLS response, and ECDSA signatures.
 * Future: AP MAC address spoofing detection, MLS response freshness checks.
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
 * 2. Signals: accessPoints array (macAddress, signalStrength), mlsResponse (lat/lon/accuracy)
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: >= 1 AP, MLS accuracy > 0, MLS coordinates in valid range
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
 * Returns raw measurements. Uses MLS accuracy estimate for radius check.
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

interface AccessPoint {
  macAddress?: string;
  signalStrength?: number;
}

interface MlsResponse {
  lat?: number;
  lon?: number;
  accuracy?: number;
}

function checkSignalConsistency(stamp: LocationStamp, details: Record<string, unknown>): boolean {
  if (!stamp.signals) return false;

  const accessPoints = stamp.signals.accessPoints as AccessPoint[] | undefined;
  if (!Array.isArray(accessPoints) || accessPoints.length === 0) {
    details.signalError = 'Missing or empty accessPoints array';
    return false;
  }

  for (const ap of accessPoints) {
    if (!ap.macAddress || typeof ap.signalStrength !== 'number') {
      details.signalError = 'Access points must have macAddress and signalStrength';
      return false;
    }
  }

  const mlsResponse = stamp.signals.mlsResponse as MlsResponse | undefined;
  if (!mlsResponse) {
    details.signalError = 'Missing mlsResponse';
    return false;
  }

  if (typeof mlsResponse.accuracy !== 'number' || mlsResponse.accuracy <= 0) {
    details.signalError = `MLS accuracy must be > 0 (got ${mlsResponse.accuracy})`;
    return false;
  }

  if (typeof mlsResponse.lat !== 'number' || typeof mlsResponse.lon !== 'number') {
    details.signalError = 'MLS response must have lat and lon';
    return false;
  }

  if (mlsResponse.lon < -180 || mlsResponse.lon > 180 || mlsResponse.lat < -90 || mlsResponse.lat > 90) {
    details.signalError = `MLS coordinates out of range: [${mlsResponse.lon}, ${mlsResponse.lat}]`;
    return false;
  }

  details.signalChecks = { apCount: accessPoints.length, mlsAccuracy: mlsResponse.accuracy, coordinatesValid: true };
  return true;
}

function getApCount(stamp: LocationStamp): number {
  const accessPoints = stamp.signals?.accessPoints as AccessPoint[] | undefined;
  return Array.isArray(accessPoints) ? accessPoints.length : 0;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const mlsResponse = stamp.signals?.mlsResponse as MlsResponse | undefined;
  if (mlsResponse?.accuracy && typeof mlsResponse.accuracy === 'number' && mlsResponse.accuracy > 0) return mlsResponse.accuracy;
  return 100; // Default WiFi MLS accuracy estimate
}
