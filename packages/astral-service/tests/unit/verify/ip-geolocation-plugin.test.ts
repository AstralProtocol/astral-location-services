/**
 * Unit tests for IP Geolocation plugin verify/evaluate logic.
 */
import { describe, it, expect } from 'vitest';
import { verifyIpGeolocationStamp, evaluateIpGeolocationStamp } from '../../../src/verify/plugins/ip-geolocation/verify.js';
import { VALID_IP_GEO_STAMP, VALID_CLAIM, signStamp, signStampWrongSigner } from '../../fixtures/verify.js';
import type { LocationStamp } from '../../../src/types/verify.js';

describe('IP Geolocation Plugin', () => {
  describe('verify()', () => {
    it('passes all checks for a valid stamp', async () => {
      const result = await verifyIpGeolocationStamp(VALID_IP_GEO_STAMP);

      expect(result.valid).toBe(true);
      expect(result.structureValid).toBe(true);
      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(true);
    });

    it('fails when ip is missing', async () => {
      const stamp: LocationStamp = {
        ...VALID_IP_GEO_STAMP,
        signals: {
          source: 'ip-geolocation',
          accuracyMeters: 25000,
        },
      };

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidIpFormat).toBe(true);
    });

    it('fails when ip format is invalid', async () => {
      const stamp: LocationStamp = {
        ...VALID_IP_GEO_STAMP,
        signals: {
          source: 'ip-geolocation',
          accuracyMeters: 25000,
          ip: 'not-an-ip',
        },
      };

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidIpFormat).toBe(true);
    });

    it('fails when accuracyMeters is below 1000', async () => {
      const stamp: LocationStamp = {
        ...VALID_IP_GEO_STAMP,
        signals: {
          source: 'ip-geolocation',
          accuracyMeters: 500,
          ip: '203.0.113.42',
        },
      };

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.suspiciousAccuracy).toBe(true);
    });

    it('fails when coordinates are out of range', async () => {
      const stamp: LocationStamp = {
        ...VALID_IP_GEO_STAMP,
        location: { type: 'Point', coordinates: [-200, 37.78] },
      };

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidLongitude).toBe(true);
    });

    it('fails when signature value is empty', async () => {
      const stamp: LocationStamp = {
        ...VALID_IP_GEO_STAMP,
        signatures: [{ ...VALID_IP_GEO_STAMP.signatures[0], value: '' }],
      };

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
    });

    it('fails when signature recovers to wrong address', async () => {
      const { signatures: _, ...unsigned } = VALID_IP_GEO_STAMP;
      const stamp = signStampWrongSigner(unsigned, Math.floor(Date.now() / 1000));

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
      expect(result.details.stampSignatureMismatch).toBeDefined();
    });

    it('fails when lpVersion is wrong', async () => {
      const stamp: LocationStamp = { ...VALID_IP_GEO_STAMP, lpVersion: '0.1' };

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
    });

    it('accepts valid IPv6 address', async () => {
      const { signatures: _, ...unsigned } = VALID_IP_GEO_STAMP;
      const stamp = signStamp({
        ...unsigned,
        signals: {
          source: 'ip-geolocation',
          accuracyMeters: 25000,
          ip: '2001:db8::1',
        },
      }, Math.floor(Date.now() / 1000));

      const result = await verifyIpGeolocationStamp(stamp);

      expect(result.valid).toBe(true);
      expect(result.signalsConsistent).toBe(true);
    });
  });

  describe('evaluate()', () => {
    it('computes distance and uses stamp accuracyMeters', async () => {
      const result = await evaluateIpGeolocationStamp(VALID_IP_GEO_STAMP, VALID_CLAIM);

      expect(result.distanceMeters).toBeLessThan(3000);
      expect(result.temporalOverlap).toBe(1.0);
      expect(result.withinRadius).toBe(true);
      expect(result.details.stampAccuracy).toBe(25000);
    });

    it('computes correct distance for distant stamp', async () => {
      const distantStamp: LocationStamp = {
        ...VALID_IP_GEO_STAMP,
        location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
      };

      const result = await evaluateIpGeolocationStamp(distantStamp, VALID_CLAIM);

      expect(result.distanceMeters).toBeGreaterThan(4000000);
      expect(result.withinRadius).toBe(false);
    });
  });
});
