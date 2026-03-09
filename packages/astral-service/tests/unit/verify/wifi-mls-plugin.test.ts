/**
 * Unit tests for WiFi MLS plugin verify/evaluate logic.
 */
import { describe, it, expect } from 'vitest';
import { verifyWifiMlsStamp, evaluateWifiMlsStamp } from '../../../src/verify/plugins/wifi-mls/verify.js';
import { VALID_WIFI_MLS_STAMP, VALID_CLAIM, signStampWrongSigner } from '../../fixtures/verify.js';
import type { LocationStamp } from '../../../src/types/verify.js';

describe('WiFi MLS Plugin', () => {
  describe('verify()', () => {
    it('passes all checks for a valid stamp', async () => {
      const result = await verifyWifiMlsStamp(VALID_WIFI_MLS_STAMP);

      expect(result.valid).toBe(true);
      expect(result.structureValid).toBe(true);
      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(true);
    });

    it('fails when apCount is zero', async () => {
      const stamp: LocationStamp = {
        ...VALID_WIFI_MLS_STAMP,
        signals: { source: 'wifi', accuracyMeters: 100, apCount: 0 },
      };

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidApCount).toBe(true);
    });

    it('fails when accuracyMeters is missing', async () => {
      const stamp: LocationStamp = {
        ...VALID_WIFI_MLS_STAMP,
        signals: { source: 'wifi', apCount: 5 },
      };

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidAccuracy).toBe(true);
    });

    it('fails when accuracyMeters is zero', async () => {
      const stamp: LocationStamp = {
        ...VALID_WIFI_MLS_STAMP,
        signals: { source: 'wifi', accuracyMeters: 0, apCount: 5 },
      };

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidAccuracy).toBe(true);
    });

    it('fails when coordinates are out of range', async () => {
      const stamp: LocationStamp = {
        ...VALID_WIFI_MLS_STAMP,
        location: { type: 'Point', coordinates: [-122.4196, 91] },
      };

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidLatitude).toBe(true);
    });

    it('fails when signature value is empty', async () => {
      const stamp: LocationStamp = {
        ...VALID_WIFI_MLS_STAMP,
        signatures: [{ ...VALID_WIFI_MLS_STAMP.signatures[0], value: '' }],
      };

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
    });

    it('fails when signature recovers to wrong address', async () => {
      const { signatures: _, ...unsigned } = VALID_WIFI_MLS_STAMP;
      const stamp = signStampWrongSigner(unsigned, Math.floor(Date.now() / 1000));

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
      expect(result.details.stampSignatureMismatch).toBeDefined();
    });

    it('fails when lpVersion is wrong', async () => {
      const stamp: LocationStamp = { ...VALID_WIFI_MLS_STAMP, lpVersion: '0.1' };

      const result = await verifyWifiMlsStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
    });
  });

  describe('evaluate()', () => {
    it('computes distance, overlap, and within-radius for nearby stamp', async () => {
      const result = await evaluateWifiMlsStamp(VALID_WIFI_MLS_STAMP, VALID_CLAIM);

      expect(result.distanceMeters).toBeLessThan(200);
      expect(result.temporalOverlap).toBe(1.0);
      expect(result.withinRadius).toBe(true);
      expect(result.details.apCount).toBe(5);
    });

    it('computes correct distance for distant stamp', async () => {
      const distantStamp: LocationStamp = {
        ...VALID_WIFI_MLS_STAMP,
        location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
      };

      const result = await evaluateWifiMlsStamp(distantStamp, VALID_CLAIM);

      expect(result.distanceMeters).toBeGreaterThan(4000000);
      expect(result.withinRadius).toBe(false);
    });
  });
});
