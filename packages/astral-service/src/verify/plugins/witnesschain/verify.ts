/**
 * WitnessChain Verification Logic (Service-Side)
 *
 * Verifies ECDSA signatures on challenge results and evaluates
 * location claims using haversine distance, temporal overlap,
 * and multi-source IP geolocation agreement.
 */

import { ethers } from 'ethers';
import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';

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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * Evaluate a WitnessChain stamp against a location claim.
 *
 * Returns raw measurements. WitnessChain-specific context (IP geolocation
 * agreement, KnowLoc status, challenge results) goes in details for
 * consumers that want plugin-specific intelligence.
 */
export async function evaluateWitnessChainStamp(
  stamp: LocationStamp,
  claim: LocationClaim
): Promise<StampEvaluation> {
  const details: Record<string, unknown> = {};

  // Extract stamp coordinates
  const loc = stamp.location;
  if (!(typeof loc === 'object' && 'coordinates' in loc)) {
    return {
      distanceMeters: Infinity,
      temporalOverlap: 0,
      withinRadius: false,
      details: { error: 'Cannot extract coordinates from stamp location' },
    };
  }
  const stampCoords = loc.coordinates as number[];

  // Extract claim coordinates
  const claimLoc = claim.location;
  if (!(typeof claimLoc === 'object' && 'coordinates' in claimLoc)) {
    return {
      distanceMeters: Infinity,
      temporalOverlap: 0,
      withinRadius: false,
      details: { error: 'Cannot extract coordinates from claim location' },
    };
  }
  const claimCoords = claimLoc.coordinates as number[];

  // Haversine distance (raw measurement)
  const distanceMeters = haversineDistance(
    stampCoords[1], stampCoords[0],
    claimCoords[1], claimCoords[0]
  );
  details.distanceMeters = Math.round(distanceMeters);

  // WitnessChain uncertainty factor for within-radius check
  const knowLocUncertaintyKm =
    (stamp.signals.knowLocUncertaintyKm as number | undefined) ?? 50;
  const uncertaintyMeters = knowLocUncertaintyKm * 1000;
  const effectiveRadius = claim.radius + uncertaintyMeters;
  details.effectiveRadiusMeters = effectiveRadius;
  details.knowLocUncertaintyKm = knowLocUncertaintyKm;

  const withinRadius = distanceMeters <= effectiveRadius;

  // Temporal overlap (raw fraction)
  const overlap = temporalOverlap(stamp.temporalFootprint, claim.time);
  details.temporalOverlap = overlap;

  // WitnessChain-specific context in details
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
      details.ipSourcesAgreed = ipSourcesAgreed;
      details.ipSourcesTotal = ipSourcesTotal;
    }
    details.knowLocVerified = consolidated.KnowLoc === true;
    details.challengeVerified = consolidated.verified === true;
  }

  if (stamp.signals.challengeSucceeded === false) {
    details.challengeFailed = true;
  }

  return { distanceMeters, temporalOverlap: overlap, withinRadius, details };
}
