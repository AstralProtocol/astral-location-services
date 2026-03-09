/**
 * IP Geolocation Verification Logic
 *
 * MVP implementation - validates structure, IP signals, and ECDSA signatures.
 * Future: VPN/proxy/tunnel detection, multi-provider cross-reference.
 *
 * // MVP SIMPLIFICATION: No VPN/proxy/tunnel detection. IP geolocation has
 * // inherently low spatial precision (~5-50km).
 * // PROVISIONAL: Validity dimensions will evolve — see CredibilityVector roadmap.
 */

import { isIP } from 'node:net';
import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';
import { computeDistance, computeTemporalOverlap, checkBaseStructure, checkSignatures } from '../geo-utils.js';

// ============================================
// Verification
// ============================================

/**
 * Verify an IP geolocation stamp's internal validity.
 *
 * Checks:
 * 1. Structure: LP v0.2, plugin name "ip-geolocation", GeoJSON Point, temporalFootprint
 * 2. Signals: ip string, accuracyMeters >= 1000 (real plugin-ip-geolocation output shape)
 * 3. Signatures: ECDSA recovery against declared signer
 * 4. Signal consistency: valid IP format, coordinates in range
 */
export async function verifyIpGeolocationStamp(stamp: LocationStamp): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};

  const structureValid = checkBaseStructure(stamp, 'ip-geolocation', details);
  const signaturesValid = await checkSignatures(stamp, details);
  // MVP SIMPLIFICATION: No VPN/proxy/tunnel detection.
  const signalsConsistent = checkSignalConsistency(stamp, details);

  const valid = structureValid && signaturesValid && signalsConsistent;

  return { valid, signaturesValid, structureValid, signalsConsistent, details };
}

// ============================================
// Evaluation
// ============================================

/**
 * Evaluate an IP geolocation stamp against a location claim.
 *
 * Returns raw measurements. Uses stamp's reported accuracyMeters for radius check.
 *
 * // PROVISIONAL: Evaluation dimensions will evolve — see CredibilityVector roadmap.
 */
export async function evaluateIpGeolocationStamp(
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

  // IP geolocation is inherently city-level (~5-50 km). An accuracy claim
  // under 1 km is physically implausible and likely indicates bad data or a
  // misconfigured provider. This is a plausibility floor, not a precision check.
  const accuracyMeters = stamp.signals.accuracyMeters as number | undefined;
  if (typeof accuracyMeters !== 'number' || accuracyMeters < 1000) {
    details.suspiciousAccuracy = true;
    valid = false;
  }

  const ip = stamp.signals.ip as string | undefined;
  if (!ip || typeof ip !== 'string' || isIP(ip) === 0) {
    details.invalidIpFormat = true;
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
    details.signalChecks = { ip, accuracyMeters, coordinatesValid: true };
  }
  return valid;
}

function getStampAccuracy(stamp: LocationStamp): number {
  const accuracyMeters = stamp.signals?.accuracyMeters as number | undefined;
  if (typeof accuracyMeters === 'number' && accuracyMeters > 0) return accuracyMeters;
  return 25000; // Conservative default for IP geolocation
}
