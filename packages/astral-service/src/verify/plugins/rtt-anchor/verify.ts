/**
 * RTT-Anchor Verification Logic
 *
 * Verifies round-trip-time location evidence from plugin-rtt-anchor's
 * attester. The anchor-signed reply bytes (reply0_raw / reply1_raw) are the
 * actual evidence; every other signals field is a reading of them, so this
 * plugin re-derives the readings from the bytes and fails signal consistency
 * on any mismatch rather than trusting the attester's summary.
 *
 * What one observation establishes: the holder of attester_key was no further
 * than provable_max_distance_m from the anchor at measurement time. It is a
 * disc of support around the anchor, not a position — evaluate() applies disc
 * semantics accordingly.
 *
 * The anchor's position is self-asserted upstream, so trust in the anchor
 * operator is load-bearing: pass a TrustedAnchorRegistry to bind anchor keys
 * to expected coordinates.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { StampEvaluation } from '../interface.js';
import {
  computeDistance,
  computeTemporalOverlap,
  checkBaseStructure,
  checkSignatures,
  haversineDistance,
} from '../geo-utils.js';
import { RttAnchorSignalsSchema, type RttAnchorSignals } from './schema.js';
import { parseReply, provableMaxDistanceM, type ParsedReply } from './wire.js';

/**
 * Trusted anchors: lowercase-hex Ed25519 key → coordinates the anchor is
 * expected to sign. A known key signing different coordinates fails signal
 * consistency; an unknown key is recorded in details for the assessment
 * layer to weigh.
 */
export type TrustedAnchorRegistry = Record<string, { lat: number; lon: number }>;

// Tolerance for float coordinate comparisons expressed as a distance, so it
// is meaningful in both lat and lon regardless of latitude.
const COORD_TOLERANCE_M = 1;

// Relative tolerance for recomputing provable_max_distance_m from signed RTT.
const BOUND_RELATIVE_TOLERANCE = 1e-9;

// ============================================
// Verification
// ============================================

/**
 * Verify an RTT-anchor stamp's internal validity.
 *
 * Checks:
 * 1. Structure: LP v0.2 base fields; signals match the vendored observation
 *    schema (strict — upstream drift fails loudly)
 * 2. Signatures: stamp wrapper ECDSA; Ed25519 on both anchor-signed replies
 *    and their echoed probes
 * 3. Signal consistency: every derived JSON field re-derived from the signed
 *    bytes; challenge nonce linkage; anchor registry; stamp location matches
 *    the anchor position the anchor actually signed
 */
export async function verifyRttAnchorStamp(
  stamp: LocationStamp,
  trustedAnchors?: TrustedAnchorRegistry
): Promise<StampVerificationResult> {
  const details: Record<string, unknown> = {};

  let structureValid = checkBaseStructure(stamp, 'rtt-anchor', details);
  let signaturesValid = await checkSignatures(stamp, details);

  const parsed = RttAnchorSignalsSchema.safeParse(stamp.signals);
  if (!parsed.success) {
    structureValid = false;
    details.signalsSchemaError = parsed.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    );
    // Without a schema-valid observation there are no evidence bytes to check.
    return { valid: false, signaturesValid, structureValid, signalsConsistent: false, details };
  }
  const obs = parsed.data;

  if (obs.error) {
    details.observationError = obs.error;
    return { valid: false, signaturesValid, structureValid, signalsConsistent: false, details };
  }

  // --- Ed25519 verification of the anchor-signed evidence ---

  const reply0 = decodeReply(obs.reply0_raw);
  const reply1 = decodeReply(obs.reply1_raw);

  if (!reply0 || !reply1) {
    signaturesValid = false;
    details.replyParseError = { reply0Parsed: !!reply0, reply1Parsed: !!reply1 };
    return { valid: false, signaturesValid, structureValid, signalsConsistent: false, details };
  }

  const anchorSignaturesValid = reply0.signatureValid && reply1.signatureValid;
  const probeSignaturesValid = reply0.probe.signatureValid && reply1.probe.signatureValid;
  if (!anchorSignaturesValid || !probeSignaturesValid) {
    signaturesValid = false;
  }
  details.evidenceSignatures = {
    reply0AnchorSignature: reply0.signatureValid,
    reply1AnchorSignature: reply1.signatureValid,
    probe0AttesterSignature: reply0.probe.signatureValid,
    probe1AttesterSignature: reply1.probe.signatureValid,
  };

  // --- Signal consistency: re-derive every reading from the signed bytes ---

  const signalsConsistent = checkEvidenceConsistency(stamp, obs, reply0, reply1, trustedAnchors, details);

  const valid = structureValid && signaturesValid && signalsConsistent;
  return { valid, signaturesValid, structureValid, signalsConsistent, details };
}

// ============================================
// Evaluation
// ============================================

/**
 * Evaluate an RTT-anchor stamp against a location claim.
 *
 * The stamp locates the subject within a disc: center at the anchor,
 * radius the provable bound at vacuum c. The claim is consistent with the
 * evidence when the claim circle intersects that disc, so the bound acts
 * as the stamp accuracy in the within-radius check. The disc is support,
 * not a position estimate — density inside it is not uniform.
 */
export async function evaluateRttAnchorStamp(
  stamp: LocationStamp,
  claim: LocationClaim
): Promise<StampEvaluation> {
  const details: Record<string, unknown> = {};

  const distanceMeters = computeDistance(stamp, claim, details);
  const temporalOverlap = computeTemporalOverlap(stamp, claim, details);

  const parsed = RttAnchorSignalsSchema.safeParse(stamp.signals);
  const boundRadiusMeters = parsed.success ? parsed.data.provable_max_distance_m : 0;

  const effectiveRadius = claim.radius + boundRadiusMeters;
  const withinRadius = distanceMeters <= effectiveRadius;

  details.claimRadius = claim.radius;
  details.boundRadiusMeters = boundRadiusMeters;
  details.effectiveRadius = effectiveRadius;
  details.discNote =
    'Bound is a support disc at vacuum c around the anchor, not a position estimate';

  if (parsed.success) {
    details.calibratedDistanceMeters = parsed.data.calibrated_distance_m;
    details.challenged = parsed.data.challenged;
    if (!parsed.data.challenged) {
      details.unchallenged = true;
    }
  } else {
    details.signalsSchemaError = 'Signals failed schema; bound treated as 0';
  }

  return { distanceMeters, temporalOverlap, withinRadius, details };
}

// ============================================
// Plugin-Specific Helpers
// ============================================

function decodeReply(raw: string): ParsedReply | null {
  try {
    return parseReply(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
}

/**
 * Cross-check the observation's derived fields against the signed bytes.
 * Every mismatch is recorded; any mismatch fails consistency.
 */
function checkEvidenceConsistency(
  stamp: LocationStamp,
  obs: RttAnchorSignals,
  reply0: ParsedReply,
  reply1: ParsedReply,
  trustedAnchors: TrustedAnchorRegistry | undefined,
  details: Record<string, unknown>
): boolean {
  let consistent = true;

  // Both replies must come from the anchor key the observation names.
  const authority0 = reply0.authorityPubkey.toString('hex');
  const authority1 = reply1.authorityPubkey.toString('hex');
  if (authority0 !== obs.anchor_key || authority1 !== obs.anchor_key) {
    consistent = false;
    details.anchorKeyMismatch = { expected: obs.anchor_key, reply0: authority0, reply1: authority1 };
  }

  // Both probes must come from the attester key the observation names.
  const sender0 = reply0.probe.senderPubkey.toString('hex');
  const sender1 = reply1.probe.senderPubkey.toString('hex');
  if (sender0 !== obs.attester_key || sender1 !== obs.attester_key) {
    consistent = false;
    details.attesterKeyMismatch = { expected: obs.attester_key, probe0: sender0, probe1: sender1 };
  }

  // The measured interval rides in reply 1's SinceLastRxNs.
  if (BigInt(obs.anchor_measured_rtt_ns) !== reply1.sinceLastRxNs) {
    consistent = false;
    details.rttMismatch = {
      reported: obs.anchor_measured_rtt_ns,
      signed: reply1.sinceLastRxNs.toString(),
    };
  }

  // Challenged flag rides in reply 1; when set, reply 0's nonce must be the
  // one echoed through probe 1's timestamp fields (causal-ordering proof).
  if (obs.challenged !== reply1.challenged) {
    consistent = false;
    details.challengedMismatch = { reported: obs.challenged, signed: reply1.challenged };
  }
  if (reply1.challenged && reply0.sinceLastRxNs !== reply1.probe.secFrac) {
    consistent = false;
    details.nonceLinkageBroken = {
      reply0Nonce: reply0.sinceLastRxNs.toString(),
      probe1Echo: reply1.probe.secFrac.toString(),
    };
  }
  if (!reply1.challenged) {
    details.unchallenged = true;
  }

  // Anchor position must match what the anchor signed.
  const positionError = haversineDistance(obs.lat, obs.lon, reply1.lat, reply1.lng);
  if (positionError > COORD_TOLERANCE_M) {
    consistent = false;
    details.anchorPositionMismatch = {
      reported: [obs.lat, obs.lon],
      signed: [reply1.lat, reply1.lng],
    };
  }

  // The stamp's own location must be the anchor position (disc center).
  if (
    typeof stamp.location === 'object' &&
    'type' in stamp.location &&
    stamp.location.type === 'Point'
  ) {
    const [lon, lat] = stamp.location.coordinates as [number, number];
    const stampError = haversineDistance(lat, lon, reply1.lat, reply1.lng);
    if (stampError > COORD_TOLERANCE_M) {
      consistent = false;
      details.stampLocationMismatch = {
        stamp: [lat, lon],
        signedAnchor: [reply1.lat, reply1.lng],
      };
    }
  }

  // Recompute the provable bound from the signed accumulated RTT at vacuum c.
  const expectedBound = provableMaxDistanceM(Number(reply1.rttNs));
  const boundError = Math.abs(obs.provable_max_distance_m - expectedBound);
  if (boundError > expectedBound * BOUND_RELATIVE_TOLERANCE + 1e-6) {
    consistent = false;
    details.provableBoundMismatch = {
      reported: obs.provable_max_distance_m,
      recomputed: expectedBound,
    };
  }

  // Anchor trust: self-asserted position, so bind key → coordinates when a
  // registry is provided. Unknown keys are noted, not failed — the
  // assessment layer weighs operator trust.
  if (trustedAnchors) {
    const expected = trustedAnchors[obs.anchor_key];
    if (!expected) {
      details.anchorUnknown = true;
    } else {
      const registryError = haversineDistance(expected.lat, expected.lon, reply1.lat, reply1.lng);
      if (registryError > COORD_TOLERANCE_M) {
        consistent = false;
        details.anchorRegistryMismatch = {
          registry: [expected.lat, expected.lon],
          signed: [reply1.lat, reply1.lng],
        };
      } else {
        details.anchorTrusted = true;
      }
    }
  }

  if (consistent) {
    details.evidenceChecks = {
      anchorKeyBound: true,
      rttFromSignedBytes: obs.anchor_measured_rtt_ns,
      provableBoundMeters: obs.provable_max_distance_m,
      challenged: reply1.challenged,
    };
  }

  return consistent;
}
