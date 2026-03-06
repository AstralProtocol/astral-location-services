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

/** Conservative default accuracy for IP geolocation (~25km) */
const DEFAULT_IP_ACCURACY_METERS = 25000;

// ============================================
// Verification
// ============================================

/**
 * Verify an IP geolocation stamp's internal validity.
 *
 * Checks:
 * 1. Structure: LP v0.2, plugin name "ip-geolocation", GeoJSON Point, temporalFootprint
 * 2. Signals: ip string, provider string, response with lat/lon
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
 * Returns raw measurements. Uses conservative accuracy (~25km default)
 * since IP geolocation has inherently low spatial precision.
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

  const stampAccuracy = DEFAULT_IP_ACCURACY_METERS;
  const effectiveRadius = claim.radius + stampAccuracy;
  const withinRadius = distanceMeters <= effectiveRadius;
  details.claimRadius = claim.radius;
  details.stampAccuracy = stampAccuracy;
  details.effectiveRadius = effectiveRadius;
  details.provider = stamp.signals?.provider;

  return { distanceMeters, temporalOverlap, withinRadius, details };
}

// ============================================
// Plugin-Specific Helpers
// ============================================

interface IpResponse {
  lat?: number;
  lon?: number;
}

function checkSignalConsistency(stamp: LocationStamp, details: Record<string, unknown>): boolean {
  if (!stamp.signals) return false;

  const ip = stamp.signals.ip as string | undefined;
  if (!ip || typeof ip !== 'string') {
    details.signalError = 'Missing ip string';
    return false;
  }

  if (isIP(ip) === 0) {
    details.signalError = `Invalid IP format: ${ip}`;
    return false;
  }

  const provider = stamp.signals.provider as string | undefined;
  if (!provider || typeof provider !== 'string') {
    details.signalError = 'Missing provider string';
    return false;
  }

  const response = stamp.signals.response as IpResponse | undefined;
  if (!response) {
    details.signalError = 'Missing response object';
    return false;
  }

  if (typeof response.lat !== 'number' || typeof response.lon !== 'number') {
    details.signalError = 'Response must have lat and lon';
    return false;
  }

  if (response.lon < -180 || response.lon > 180 || response.lat < -90 || response.lat > 90) {
    details.signalError = `Response coordinates out of range: [${response.lon}, ${response.lat}]`;
    return false;
  }

  details.signalChecks = { ip, provider, coordinatesValid: true };
  return true;
}
