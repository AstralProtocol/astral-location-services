/**
 * WitnessChain Verification Logic (Service-Side)
 *
 * Verifies ECDSA signatures on challenge results and evaluates
 * location claims using haversine distance, temporal overlap,
 * and multi-source IP geolocation agreement.
 */

import { ethers } from 'ethers';
import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { CredibilityVector } from '../interface.js';

// ============================================
// Verification
// ============================================

/**
 * Verify a WitnessChain stamp's internal validity.
 *
 * Checks:
 * 1. Structure: required fields, correct plugin name, LP version
 * 2. Signatures: ECDSA challenge signature recovers to challenger address
 * 3. Signal consistency: coordinates in range, consolidated result valid
 */
export async function verifyWitnessChainStamp(
  stamp: LocationStamp
): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};
  let signaturesValid = true;
  let structureValid = true;
  let signalsConsistent = true;

  // --- Structure checks ---

  if (stamp.lpVersion !== '0.2') {
    structureValid = false;
    details.lpVersionError = `Expected '0.2', got '${stamp.lpVersion}'`;
  }

  if (stamp.plugin !== 'witnesschain') {
    structureValid = false;
    details.pluginMismatch = `Expected 'witnesschain', got '${stamp.plugin}'`;
  }

  if (!stamp.location || !stamp.temporalFootprint) {
    structureValid = false;
    details.missingFields = true;
  }

  // Check for challenge data in signals
  const challengeResult = stamp.signals.challengeResult as
    | { message: string; signature: string; challenger: string }
    | undefined;

  if (!challengeResult) {
    if (!stamp.signals.challengeId || stamp.signals.challengeSucceeded === undefined) {
      structureValid = false;
      details.missingChallengeData = true;
    }
  }

  // --- ECDSA signature verification ---

  if (challengeResult) {
    try {
      const recovered = ethers.verifyMessage(
        challengeResult.message,
        challengeResult.signature
      );

      if (recovered.toLowerCase() !== challengeResult.challenger.toLowerCase()) {
        signaturesValid = false;
        details.challengeSignatureMismatch = {
          expected: challengeResult.challenger,
          recovered,
        };
      } else {
        details.challengeSignerVerified = true;
        details.recoveredAddress = recovered;
      }
    } catch (e) {
      signaturesValid = false;
      details.challengeSignatureError = e instanceof Error ? e.message : String(e);
    }
  }

  // Also verify Astral-level stamp signatures if present
  if (stamp.signatures && stamp.signatures.length > 0) {
    for (const sig of stamp.signatures) {
      try {
        const { signatures: _, ...unsigned } = stamp;
        const message = JSON.stringify(unsigned);
        const recovered = ethers.verifyMessage(message, sig.value);
        if (recovered.toLowerCase() !== sig.signer.value.toLowerCase()) {
          signaturesValid = false;
          details.stampSignatureMismatch = {
            expected: sig.signer.value,
            recovered,
          };
        }
      } catch (e) {
        signaturesValid = false;
        details.stampSignatureError = e instanceof Error ? e.message : String(e);
      }
    }
  } else if (!challengeResult) {
    signaturesValid = false;
    details.noSignatures = true;
  }

  // --- Signal consistency ---

  const loc = stamp.location;
  if (typeof loc === 'object' && 'coordinates' in loc) {
    const coords = loc.coordinates as number[];
    if (coords[0] < -180 || coords[0] > 180) {
      signalsConsistent = false;
      details.invalidLongitude = coords[0];
    }
    if (coords[1] < -90 || coords[1] > 90) {
      signalsConsistent = false;
      details.invalidLatitude = coords[1];
    }
  }

  if (stamp.signals.challengeSucceeded === false) {
    details.challengeFailed = true;
  }

  const consolidated = stamp.signals.consolidatedResult as
    | Record<string, unknown>
    | undefined;
  if (consolidated) {
    if (typeof consolidated.KnowLoc !== 'boolean') {
      signalsConsistent = false;
      details.invalidConsolidatedResult = 'KnowLoc must be boolean';
    }
  }

  return {
    valid: signaturesValid && structureValid && signalsConsistent,
    signaturesValid,
    structureValid,
    signalsConsistent,
    details,
  };
}

// ============================================
// Evaluation
// ============================================

const EARTH_RADIUS_M = 6_371_000;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function temporalOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): number {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);
  if (overlapEnd <= overlapStart) return 0;
  const overlap = overlapEnd - overlapStart;
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return shorter > 0 ? overlap / shorter : 0;
}

/**
 * Evaluate how well a WitnessChain stamp supports a location claim.
 */
export async function evaluateWitnessChainStamp(
  stamp: LocationStamp,
  claim: LocationClaim
): Promise<CredibilityVector> {
  const details: Record<string, unknown> = {};

  // Extract stamp coordinates
  let stampLat: number;
  let stampLon: number;
  const loc = stamp.location;
  if (typeof loc === 'object' && 'coordinates' in loc) {
    const coords = loc.coordinates as number[];
    stampLon = coords[0];
    stampLat = coords[1];
  } else {
    return {
      supportsClaim: false,
      score: 0,
      spatial: 0,
      temporal: 0,
      details: { error: 'Cannot extract coordinates from stamp location' },
    };
  }

  // Extract claim coordinates
  let claimLat: number;
  let claimLon: number;
  const claimLoc = claim.location;
  if (typeof claimLoc === 'object' && 'coordinates' in claimLoc) {
    const coords = claimLoc.coordinates as number[];
    claimLon = coords[0];
    claimLat = coords[1];
  } else {
    return {
      supportsClaim: false,
      score: 0,
      spatial: 0,
      temporal: 0,
      details: { error: 'Cannot extract coordinates from claim location' },
    };
  }

  // Spatial scoring
  const distance = haversineDistance(stampLat, stampLon, claimLat, claimLon);
  details.distanceMeters = Math.round(distance);

  const knowLocUncertaintyKm =
    (stamp.signals.knowLocUncertaintyKm as number | undefined) ?? 50;
  const uncertaintyMeters = knowLocUncertaintyKm * 1000;
  const effectiveRadius = claim.radius + uncertaintyMeters;
  details.effectiveRadiusMeters = effectiveRadius;

  let spatial: number;
  if (distance <= effectiveRadius) {
    spatial = 1.0 - distance / effectiveRadius;
  } else {
    spatial = Math.max(0, 1.0 - distance / (effectiveRadius * 3));
  }

  // Multi-source verification bonuses
  const consolidated = stamp.signals.consolidatedResult as
    | Record<string, unknown>
    | undefined;

  if (consolidated) {
    let ipSourcesAgreed = 0;
    let ipSourcesTotal = 0;
    for (const key of ['ipapi.co', 'ipregistry', 'maxmind'] as const) {
      if (consolidated[key] !== undefined) {
        ipSourcesTotal++;
        if (consolidated[key] === true) ipSourcesAgreed++;
      }
    }

    if (ipSourcesTotal > 0) {
      const ipAgreementRatio = ipSourcesAgreed / ipSourcesTotal;
      spatial = Math.min(1.0, spatial + ipAgreementRatio * 0.1);
      details.ipSourcesAgreed = ipSourcesAgreed;
      details.ipSourcesTotal = ipSourcesTotal;
    }

    if (consolidated.KnowLoc === true) {
      spatial = Math.min(1.0, spatial + 0.05);
    }

    if (consolidated.verified === true) {
      spatial = Math.min(1.0, spatial + 0.05);
    }
  }

  // Temporal scoring
  const temporal = temporalOverlap(stamp.temporalFootprint, claim.time);
  details.temporalOverlap = temporal;

  // Challenge failure penalty
  let challengePenalty = 0;
  if (stamp.signals.challengeSucceeded === false) {
    challengePenalty = 0.3;
    details.challengeFailedPenalty = challengePenalty;
  }

  // Combined score
  const rawScore = spatial * 0.65 + temporal * 0.35 - challengePenalty;
  const score = Math.max(0, Math.min(1, rawScore));
  const supportsClaim = score > 0.3 && spatial > 0.1 && temporal > 0;

  return { supportsClaim, score, spatial, temporal, details };
}
