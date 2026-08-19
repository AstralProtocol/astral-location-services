/**
 * Unit tests for RTT-anchor plugin verify/evaluate logic.
 *
 * Fixtures carry real Ed25519 signatures over byte-faithful reply packets
 * (see fixtures/rtt-anchor.ts); measurements are synthetic.
 */
import { describe, it, expect } from 'vitest';
import { verifyRttAnchorStamp, evaluateRttAnchorStamp } from '../../../src/verify/plugins/rtt-anchor/verify.js';
import type { LocationClaim, LocationStamp } from '../../../src/verify/types/index.js';
import {
  buildObservation,
  makeRttAnchorStamp,
  tamperReply1Signature,
} from '../../fixtures/rtt-anchor.js';
import { signStamp } from '../../fixtures/verify.js';

const now = Math.floor(Date.now() / 1000);

// Claim at the anchor position — well inside the ~1861km bound.
function claimAt(lon: number, lat: number, radius = 100): LocationClaim {
  return {
    lpVersion: '0.2',
    locationType: 'geojson-point',
    location: { type: 'Point', coordinates: [lon, lat] },
    srs: 'EPSG:4326',
    subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
    radius,
    time: { start: now - 60, end: now },
    eventType: 'presence',
  };
}

// Re-sign a stamp after mutating its signals so the wrapper ECDSA stays valid
// and the checks under test are the evidence checks, not the wrapper.
function withSignals(stamp: LocationStamp, signals: Record<string, unknown>): LocationStamp {
  const { signatures: _, ...unsigned } = stamp;
  return signStamp({ ...unsigned, signals }, now - 30);
}

describe('RTT-Anchor Plugin', () => {
  describe('verify()', () => {
    it('passes all checks for a valid challenged observation', async () => {
      const stamp = makeRttAnchorStamp(buildObservation());

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.valid).toBe(true);
      expect(result.structureValid).toBe(true);
      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(true);
      expect(result.details.evidenceChecks).toBeDefined();
    });

    it('fails signatures when the anchor-signed bytes are tampered', async () => {
      const fixture = buildObservation();
      const stamp = withSignals(
        makeRttAnchorStamp(fixture),
        tamperReply1Signature(fixture.signals) as unknown as Record<string, unknown>
      );

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
      expect(
        (result.details.evidenceSignatures as Record<string, boolean>).reply1AnchorSignature
      ).toBe(false);
    });

    it('fails consistency when reported RTT contradicts the signed bytes', async () => {
      const fixture = buildObservation();
      const stamp = withSignals(makeRttAnchorStamp(fixture), {
        ...fixture.signals,
        anchor_measured_rtt_ns: fixture.signals.anchor_measured_rtt_ns + 1_000_000,
      });

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.rttMismatch).toBeDefined();
    });

    it('fails consistency when the provable bound contradicts the signed RTT', async () => {
      const fixture = buildObservation();
      const stamp = withSignals(makeRttAnchorStamp(fixture), {
        ...fixture.signals,
        provable_max_distance_m: fixture.signals.provable_max_distance_m / 2,
      });

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.signalsConsistent).toBe(false);
      expect(result.details.provableBoundMismatch).toBeDefined();
    });

    it('fails consistency when the challenged flag contradicts the signed bytes', async () => {
      const fixture = buildObservation({ challenged: false });
      const stamp = withSignals(makeRttAnchorStamp(fixture), {
        ...fixture.signals,
        challenged: true,
      });

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.signalsConsistent).toBe(false);
      expect(result.details.challengedMismatch).toBeDefined();
    });

    it('fails consistency when the challenge nonce linkage is broken', async () => {
      const stamp = makeRttAnchorStamp(buildObservation({ breakNonceLinkage: true }));

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.signalsConsistent).toBe(false);
      expect(result.details.nonceLinkageBroken).toBeDefined();
    });

    it('accepts an unchallenged observation but grades it down in details', async () => {
      const stamp = makeRttAnchorStamp(buildObservation({ challenged: false }));

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.valid).toBe(true);
      expect(result.details.unchallenged).toBe(true);
    });

    it('notes an unknown anchor key when a registry is provided', async () => {
      const fixture = buildObservation();
      const stamp = makeRttAnchorStamp(fixture);

      const result = await verifyRttAnchorStamp(stamp, {
        ['ab'.repeat(32)]: { lat: fixture.lat, lon: fixture.lon },
      });

      expect(result.valid).toBe(true);
      expect(result.details.anchorUnknown).toBe(true);
    });

    it('fails consistency when a trusted anchor signs different coordinates', async () => {
      const fixture = buildObservation();
      const stamp = makeRttAnchorStamp(fixture);

      const result = await verifyRttAnchorStamp(stamp, {
        [fixture.anchorKeyHex]: { lat: 48.8566, lon: 2.3522 }, // registry says Paris
      });

      expect(result.signalsConsistent).toBe(false);
      expect(result.details.anchorRegistryMismatch).toBeDefined();
    });

    it('trusts a registered anchor whose signed position matches', async () => {
      const fixture = buildObservation();
      const stamp = makeRttAnchorStamp(fixture);

      const result = await verifyRttAnchorStamp(stamp, {
        [fixture.anchorKeyHex]: { lat: fixture.lat, lon: fixture.lon },
      });

      expect(result.valid).toBe(true);
      expect(result.details.anchorTrusted).toBe(true);
    });

    it('fails structure on unknown signals fields (strict vendored schema)', async () => {
      const fixture = buildObservation();
      const stamp = withSignals(makeRttAnchorStamp(fixture), {
        ...fixture.signals,
        surprise_field: 1,
      });

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
      expect(result.details.signalsSchemaError).toBeDefined();
    });

    it('fails structure when the raw evidence bytes are missing', async () => {
      const fixture = buildObservation();
      const { reply0_raw: _r0, reply1_raw: _r1, ...withoutRaw } = fixture.signals;
      const stamp = withSignals(makeRttAnchorStamp(fixture), withoutRaw);

      const result = await verifyRttAnchorStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
    });
  });

  describe('evaluate()', () => {
    it('is within radius for a claim at the anchor position', async () => {
      const fixture = buildObservation();
      const stamp = makeRttAnchorStamp(fixture);

      const result = await evaluateRttAnchorStamp(stamp, claimAt(fixture.lon, fixture.lat));

      expect(result.distanceMeters).toBeCloseTo(0, 0);
      expect(result.temporalOverlap).toBe(1.0);
      expect(result.withinRadius).toBe(true);
    });

    it('is within radius for a distant claim still inside the bound disc', async () => {
      // ~12.4ms RTT bounds ~1861km; Paris is ~344km from London.
      const fixture = buildObservation();
      const stamp = makeRttAnchorStamp(fixture);

      const result = await evaluateRttAnchorStamp(stamp, claimAt(2.3522, 48.8566));

      expect(result.distanceMeters).toBeGreaterThan(300_000);
      expect(result.withinRadius).toBe(true);
    });

    it('is outside radius when the claim exceeds bound plus claim radius', async () => {
      // ~1ms RTT bounds ~150km; New York is far outside it from London.
      const fixture = buildObservation({ rttNs: 1_000_000n });
      const stamp = makeRttAnchorStamp(fixture);

      const result = await evaluateRttAnchorStamp(stamp, claimAt(-73.9857, 40.7484));

      expect(result.withinRadius).toBe(false);
      expect(result.details.boundRadiusMeters).toBeCloseTo(149_896.229, 2);
    });
  });
});
