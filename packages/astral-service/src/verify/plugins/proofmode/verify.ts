/**
 * ProofMode Verification Logic
 *
 * MVP implementation - validates structure and signatures.
 * Future: Full device attestation verification with hardware checks.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';
import { computeDistance, computeTemporalOverlap } from '../geo-utils.js';

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

