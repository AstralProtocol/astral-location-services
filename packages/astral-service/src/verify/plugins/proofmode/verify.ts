/**
 * ProofMode Verification Logic
 *
 * MVP implementation - validates structure and signatures.
 * Future: Full device attestation verification with hardware checks.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { ClaimAssessment } from '../interface.js';

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
  const pluginResult: Record<string, unknown> = {};

  // Check structure validity
  const structureValid = checkStructure(stamp);
  pluginResult.structureChecks = {
    hasLocation: !!stamp.location,
    hasTemporalFootprint: !!stamp.temporalFootprint,
    hasSignals: !!stamp.signals,
  };

  // Check signature validity
  const signaturesValid = await checkSignatures(stamp);
  pluginResult.signatureCount = stamp.signatures.length;

  // Check signal consistency
  const signalsConsistent = checkSignalConsistency(stamp);
  pluginResult.signalChecks = {
    hasRequiredSignals: true, // MVP: Accept any signals
  };

  const valid = structureValid && signaturesValid && signalsConsistent;

  return {
    valid,
    signaturesValid,
    structureValid,
    signalsConsistent,
    pluginResult,
  };
}

/**
 * Assess how well a ProofMode stamp supports a location claim.
 *
 * MVP implementation:
 * - Check spatial overlap (stamp location vs claim location)
 * - Check temporal overlap (stamp footprint vs claim time)
 *
 * Future: Use PostGIS for proper spatial analysis
 */
export async function assessProofModeStamp(
  stamp: LocationStamp,
  claim: LocationClaim
): Promise<ClaimAssessment> {
  const details: Record<string, unknown> = {};

  // Check temporal overlap
  const temporalOverlap = checkTemporalOverlap(stamp, claim);
  details.temporalOverlap = temporalOverlap;

  // Check spatial overlap (MVP: simplified check)
  const spatialOverlap = checkSpatialOverlap(stamp, claim);
  details.spatialOverlap = spatialOverlap;

  // Calculate support score
  // MVP: Simple weighted average
  const temporalWeight = 0.4;
  const spatialWeight = 0.6;
  const claimSupportScore =
    temporalOverlap.score * temporalWeight +
    spatialOverlap.score * spatialWeight;

  const supportsClaim = claimSupportScore > 0.5;

  return {
    supportsClaim,
    claimSupportScore,
    details,
  };
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
  // This function only checks format (valid hex), not that the signature
  // actually corresponds to the stamp content. Any valid hex string is accepted.
  //
  // Phase 2 should implement actual verification:
  // - Recover signer address from signature using ecrecover
  // - Verify recovered address matches sig.signer.value
  // - Verify the signed message is the canonical stamp content
  //
  // See: ethers.verifyMessage() or ethers.recoverAddress()
  for (const sig of stamp.signatures) {
    if (!sig.value || !sig.value.startsWith('0x')) {
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

interface OverlapResult {
  score: number;
  details: string;
}

function checkTemporalOverlap(stamp: LocationStamp, claim: LocationClaim): OverlapResult {
  const stampStart = stamp.temporalFootprint.start;
  const stampEnd = stamp.temporalFootprint.end;
  const claimStart = claim.time.start;
  const claimEnd = claim.time.end;

  // Check if stamp timeframe contains claim timeframe
  if (stampStart <= claimStart && stampEnd >= claimEnd) {
    return { score: 1.0, details: 'Stamp fully covers claim timeframe' };
  }

  // Check for partial overlap
  const overlapStart = Math.max(stampStart, claimStart);
  const overlapEnd = Math.min(stampEnd, claimEnd);

  if (overlapStart <= overlapEnd) {
    const overlapDuration = overlapEnd - overlapStart;
    const claimDuration = claimEnd - claimStart;
    const score = claimDuration > 0 ? overlapDuration / claimDuration : 0;
    return { score, details: `Partial temporal overlap: ${Math.round(score * 100)}%` };
  }

  return { score: 0, details: 'No temporal overlap' };
}

function checkSpatialOverlap(stamp: LocationStamp, claim: LocationClaim): OverlapResult {
  // MVP: Simplified spatial check
  // Future: Use PostGIS ST_Contains, ST_DWithin for proper analysis

  // If both are GeoJSON points, calculate distance
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

    // Simple haversine distance (meters)
    const distance = haversineDistance(
      claimCoords[1], claimCoords[0],
      stampCoords[1], stampCoords[0]
    );

    // Check if stamp is within claim radius
    if (distance <= claim.radius) {
      return { score: 1.0, details: `Stamp within claim radius (${Math.round(distance)}m <= ${claim.radius}m)` };
    }

    // Partial score based on how close
    const maxDistance = claim.radius * 3; // Score degrades to 0 at 3x radius
    if (distance <= maxDistance) {
      const score = 1 - (distance - claim.radius) / (maxDistance - claim.radius);
      return { score, details: `Stamp outside radius but close (${Math.round(distance)}m)` };
    }

    return { score: 0, details: `Stamp too far from claim (${Math.round(distance)}m > ${claim.radius}m)` };
  }

  // For non-point geometries, MVP returns 0.5 (needs PostGIS)
  return { score: 0.5, details: 'Complex geometry comparison requires PostGIS (MVP fallback)' };
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
