/**
 * Shared geospatial and verification utilities for plugins.
 *
 * Haversine distance, temporal overlap, structure checks, and
 * ECDSA signature verification used by all plugin implementations.
 */

import { ethers } from 'ethers';
import type { LocationStamp, LocationClaim } from '../types/index.js';

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate haversine distance between two points in meters.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Compute haversine distance between stamp and claim locations (meters).
 * Returns Infinity if coordinates can't be extracted (non-point geometries).
 */
export function computeDistance(
  stamp: LocationStamp,
  claim: LocationClaim,
  details: Record<string, unknown>
): number {
  if (
    typeof stamp.location === 'object' &&
    'type' in stamp.location &&
    stamp.location.type === 'Point' &&
    typeof claim.location === 'object' &&
    'type' in claim.location &&
    claim.location.type === 'Point'
  ) {
    const stampCoords = stamp.location.coordinates as [number, number];
    const claimCoords = claim.location.coordinates as [number, number];

    const distance = haversineDistance(
      claimCoords[1], claimCoords[0],
      stampCoords[1], stampCoords[0]
    );

    details.distanceMeters = Math.round(distance);
    return distance;
  }

  details.distanceNote = 'Complex geometry — distance requires PostGIS';
  return Infinity;
}

/**
 * Compute temporal overlap fraction between stamp and claim time windows.
 * Returns 0-1 where 1.0 = stamp fully covers claim timeframe.
 */
export function computeTemporalOverlap(
  stamp: LocationStamp,
  claim: LocationClaim,
  details: Record<string, unknown>
): number {
  const stampStart = stamp.temporalFootprint.start;
  const stampEnd = stamp.temporalFootprint.end;
  const claimStart = claim.time.start;
  const claimEnd = claim.time.end;

  if (stampStart <= claimStart && stampEnd >= claimEnd) {
    details.temporalNote = 'Stamp fully covers claim timeframe';
    return 1.0;
  }

  const overlapStart = Math.max(stampStart, claimStart);
  const overlapEnd = Math.min(stampEnd, claimEnd);

  if (overlapStart <= overlapEnd) {
    const overlapDuration = overlapEnd - overlapStart;
    const claimDuration = claimEnd - claimStart;
    const overlap = claimDuration > 0 ? overlapDuration / claimDuration : 0;
    details.temporalNote = `Partial overlap: ${Math.round(overlap * 100)}%`;
    return overlap;
  }

  details.temporalNote = 'No temporal overlap';
  return 0;
}

// ============================================
// Structure Validation
// ============================================

/**
 * Check base LP v0.2 structure common to all plugins.
 * Validates lpVersion, plugin name, GeoJSON Point, temporalFootprint,
 * and required metadata fields.
 */
export function checkBaseStructure(
  stamp: LocationStamp,
  expectedPlugin: string,
  details: Record<string, unknown>
): boolean {
  let valid = true;

  if (!stamp.lpVersion || stamp.lpVersion !== '0.2') {
    valid = false;
    details.lpVersionError = `Expected '0.2', got '${stamp.lpVersion}'`;
  }

  if (stamp.plugin !== expectedPlugin) {
    valid = false;
    details.pluginMismatch = `Expected '${expectedPlugin}', got '${stamp.plugin}'`;
  }

  if (!stamp.location || typeof stamp.location !== 'object' || !('type' in stamp.location) || stamp.location.type !== 'Point') {
    valid = false;
    details.locationError = 'Expected GeoJSON Point';
  }

  if (!stamp.temporalFootprint) {
    valid = false;
    details.missingTemporalFootprint = true;
  }

  if (!stamp.locationType) {
    valid = false;
    details.missingLocationType = true;
  }
  if (!stamp.srs) {
    valid = false;
    details.missingSrs = true;
  }
  if (!stamp.pluginVersion) {
    valid = false;
    details.missingPluginVersion = true;
  }
  if (!stamp.signatures || stamp.signatures.length === 0) {
    valid = false;
    details.missingSignatures = true;
  }

  details.structureChecks = {
    hasLocation: !!stamp.location,
    hasTemporalFootprint: !!stamp.temporalFootprint,
    hasSignals: !!stamp.signals,
  };

  return valid;
}

// ============================================
// Canonicalization
// ============================================

/**
 * Deterministic JSON serialization with sorted keys.
 * Matches the canonicalize() used by all plugins when signing stamps.
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (value as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return value;
  });
}

// ============================================
// Signature Verification
// ============================================

/**
 * Verify ECDSA signatures on a stamp.
 * Recovers the signer address from each signature and compares
 * against the declared signer value.
 */
export async function checkSignatures(
  stamp: LocationStamp,
  details: Record<string, unknown>
): Promise<boolean> {
  if (!stamp.signatures || stamp.signatures.length === 0) {
    details.noSignatures = true;
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signatures: _, ...unsigned } = stamp;
  const message = canonicalize(unsigned);

  for (const sig of stamp.signatures) {
    if (!sig.value || sig.value.trim().length === 0) {
      details.signatureError = 'Signature value is empty';
      return false;
    }
    if (!sig.signer || !sig.signer.scheme || !sig.signer.value) {
      details.signatureError = 'Signer fields incomplete';
      return false;
    }
    if (!sig.algorithm) {
      details.signatureError = 'Missing algorithm field';
      return false;
    }
    if (sig.algorithm !== 'secp256k1') {
      details.signatureError = `Unsupported algorithm '${sig.algorithm}' — only secp256k1 is verified`;
      return false;
    }

    try {
      const recovered = ethers.verifyMessage(message, sig.value);
      if (recovered.toLowerCase() !== sig.signer.value.toLowerCase()) {
        details.stampSignatureMismatch = { expected: sig.signer.value, recovered };
        return false;
      }
    } catch (e) {
      details.stampSignatureError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  details.signatureCount = stamp.signatures.length;
  return true;
}
