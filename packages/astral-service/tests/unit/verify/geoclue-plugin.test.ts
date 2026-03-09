/**
 * Unit tests for GeoClue plugin verify/evaluate logic.
 */
import { describe, it, expect } from 'vitest';
import { verifyGeoclueStamp, evaluateGeoclueStamp } from '../../../src/verify/plugins/geoclue/verify.js';
import { VALID_GEOCLUE_STAMP, VALID_CLAIM, signStamp, signStampWrongSigner } from '../../fixtures/verify.js';
import type { LocationStamp } from '../../../src/types/verify.js';

describe('GeoClue Plugin', () => {
  describe('verify()', () => {
    it('passes all checks for a valid stamp', async () => {
      const result = await verifyGeoclueStamp(VALID_GEOCLUE_STAMP);

      expect(result.valid).toBe(true);
      expect(result.structureValid).toBe(true);
      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(true);
    });

    it('fails when accuracyMeters is missing', async () => {
      const { signatures: _, ...unsigned } = VALID_GEOCLUE_STAMP;
      const stamp = signStamp(
        { ...unsigned, signals: { source: 'geoclue2', platform: 'linux' } },
        Math.floor(Date.now() / 1000),
      );

      const result = await verifyGeoclueStamp(stamp);

      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidAccuracy).toBe(true);
    });

    it('fails when accuracyMeters is zero', async () => {
      const { signatures: _, ...unsigned } = VALID_GEOCLUE_STAMP;
      const stamp = signStamp(
        { ...unsigned, signals: { source: 'geoclue2', accuracyMeters: 0, platform: 'linux' } },
        Math.floor(Date.now() / 1000),
      );

      const result = await verifyGeoclueStamp(stamp);

      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidAccuracy).toBe(true);
    });

    it('fails when platform is not linux', async () => {
      const { signatures: _, ...unsigned } = VALID_GEOCLUE_STAMP;
      const stamp = signStamp(
        { ...unsigned, signals: { source: 'geoclue2', accuracyMeters: 50, platform: 'windows' } },
        Math.floor(Date.now() / 1000),
      );

      const result = await verifyGeoclueStamp(stamp);

      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidPlatform).toBe(true);
    });

    it('fails when signature value is empty', async () => {
      const stamp: LocationStamp = {
        ...VALID_GEOCLUE_STAMP,
        signatures: [{ ...VALID_GEOCLUE_STAMP.signatures[0], value: '' }],
      };

      const result = await verifyGeoclueStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
    });

    it('fails when signature recovers to wrong address', async () => {
      const { signatures: _, ...unsigned } = VALID_GEOCLUE_STAMP;
      const stamp = signStampWrongSigner(unsigned, Math.floor(Date.now() / 1000));

      const result = await verifyGeoclueStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
      expect(result.details.stampSignatureMismatch).toBeDefined();
    });

    it('fails when lpVersion is wrong', async () => {
      const stamp: LocationStamp = { ...VALID_GEOCLUE_STAMP, lpVersion: '0.1' };

      const result = await verifyGeoclueStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
    });

    it('fails when coordinates are out of range', async () => {
      const { signatures: _, ...unsigned } = VALID_GEOCLUE_STAMP;
      const stamp = signStamp(
        { ...unsigned, location: { type: 'Point', coordinates: [-200, 37.7749] } },
        Math.floor(Date.now() / 1000),
      );

      const result = await verifyGeoclueStamp(stamp);

      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.invalidLongitude).toBe(true);
    });
  });

  describe('evaluate()', () => {
    it('computes distance, overlap, and within-radius for nearby stamp', async () => {
      const result = await evaluateGeoclueStamp(VALID_GEOCLUE_STAMP, VALID_CLAIM);

      expect(result.distanceMeters).toBeLessThan(200);
      expect(result.temporalOverlap).toBe(1.0);
      expect(result.withinRadius).toBe(true); // within claim.radius + stamp accuracy
    });

    it('computes correct distance for distant stamp', async () => {
      const distantStamp: LocationStamp = {
        ...VALID_GEOCLUE_STAMP,
        location: { type: 'Point', coordinates: [-73.9857, 40.7484] }, // NYC
      };

      const result = await evaluateGeoclueStamp(distantStamp, VALID_CLAIM);

      // SF to NYC is ~4,100 km
      expect(result.distanceMeters).toBeGreaterThan(4000000);
      expect(result.withinRadius).toBe(false);
    });
  });
});
