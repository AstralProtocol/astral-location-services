/**
 * ProofMode Verification Logic
 *
 * MVP implementation - validates structure and signatures.
 * Future: Full device attestation verification with hardware checks.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';

/**
 * Verify a ProofMode stamp's internal validity.
 *
 * MVP checks:
 * - Stamp has required structure
 * - At least one signature present
 * - Signature format is valid
 *
 * Future: Verify device attestation, hardware-backed keys, SafetyNet/DeviceCheck
 */
export async function verifyProofModeStamp(stamp: LocationStamp): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};

  // Check structure validity
  const structureValid = checkStructure(stamp);
  details.structureChecks = {
    hasLocation: !!stamp.location,
    hasTemporalFootprint: !!stamp.temporalFootprint,
    hasSignals: !!stamp.signals,
  };

  // Check signature validity
  const signaturesValid = await checkSignatures(stamp);
  details.signatureCount = stamp.signatures.length;

  // Check signal consistency
  const signalsConsistent = checkSignalConsistency(stamp);
  details.signalChecks = {
    hasRequiredSignals: true, // MVP: Accept any signals
  };

  const valid = structureValid && signaturesValid && signalsConsistent;

  return {
    valid,
    signaturesValid,
    structureValid,
    signalsConsistent,
    details,
  };
}

/**
 * Evaluate a ProofMode stamp against a location claim.
 *
 * Returns raw measurements (distance, temporal overlap, within-radius)
 * instead of opinionated scores. Consumers decide thresholds.
 */
export async function evaluateProofModeStamp(
  stamp: LocationStamp,
  claim: LocationClaim
): Promise<StampEvaluation> {
  const details: Record<string, unknown> = {};

  // Compute haversine distance (meters)
  const distanceMeters = computeDistance(stamp, claim, details);

  // Compute temporal overlap fraction (0-1)
  const temporalOverlap = computeTemporalOverlap(stamp, claim, details);

  // Within radius check
  const withinRadius = distanceMeters <= claim.radius;
  details.claimRadius = claim.radius;

  return { distanceMeters, temporalOverlap, withinRadius, details };
}

// ============================================
// Internal Helpers
// ============================================

function checkStructure(stamp: LocationStamp): boolean {
  // Required fields check
  if (!stamp.lpVersion || stamp.lpVersion !== '0.2') return false;
  if (!stamp.locationType) return false;
  if (!stamp.location) return false;
  if (!stamp.srs) return false;
  if (!stamp.temporalFootprint) return false;
  if (!stamp.plugin) return false;
  if (!stamp.pluginVersion) return false;
  if (!stamp.signatures || stamp.signatures.length === 0) return false;

  return true;
}

async function checkSignatures(stamp: LocationStamp): Promise<boolean> {
  if (!stamp.signatures || stamp.signatures.length === 0) {
    return false;
  }

  // SECURITY TODO: Signatures are NOT cryptographically verified in MVP.
  // This function only checks that required fields are present.
  // Real ProofMode stamps carry PGP signatures (ASCII-armored),
  // while wallet-signed stamps carry hex (0x-prefixed).
  //
  // Phase 2 should implement actual verification per algorithm:
  // - 'secp256k1'/'eip712': ecrecover, ethers.verifyMessage()
  // - 'pgp': openpgp.js verify against pubkey.asc
  for (const sig of stamp.signatures) {
    if (!sig.value || sig.value.trim().length === 0) {
      return false;
    }
    if (!sig.signer || !sig.signer.scheme || !sig.signer.value) {
      return false;
    }
    if (!sig.algorithm) {
      return false;
    }
  }

  return true;
}

function checkSignalConsistency(stamp: LocationStamp): boolean {
  // MVP: Accept any signals as consistent
  // Future: Plugin-specific signal validation
  return stamp.signals !== undefined;
}

/**
 * Compute haversine distance between stamp and claim locations (meters).
 * Returns Infinity if coordinates can't be extracted (non-point geometries).
 */
function computeDistance(
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

  // Non-point geometries: can't compute distance in MVP
  details.distanceNote = 'Complex geometry — distance requires PostGIS';
  return Infinity;
}

/**
 * Compute temporal overlap fraction between stamp and claim time windows.
 * Returns 0-1 where 1.0 = stamp fully covers claim timeframe.
 */
function computeTemporalOverlap(
  stamp: LocationStamp,
  claim: LocationClaim,
  details: Record<string, unknown>
): number {
  const stampStart = stamp.temporalFootprint.start;
  const stampEnd = stamp.temporalFootprint.end;
  const claimStart = claim.time.start;
  const claimEnd = claim.time.end;

  // Full coverage
  if (stampStart <= claimStart && stampEnd >= claimEnd) {
    details.temporalNote = 'Stamp fully covers claim timeframe';
    return 1.0;
  }

  // Partial overlap
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

/**
 * Calculate haversine distance between two points in meters.
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
