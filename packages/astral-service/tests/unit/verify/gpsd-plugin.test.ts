/**
 * Unit tests for GPSD plugin verify/evaluate logic.
 */
import { describe, it, expect } from 'vitest';
import { verifyGpsdStamp, evaluateGpsdStamp } from '../../../src/verify/plugins/gpsd/verify.js';
import { VALID_GPSD_STAMP, VALID_CLAIM, signStampWrongSigner } from '../../fixtures/verify.js';
import type { LocationStamp } from '../../../src/types/verify.js';

describe('GPSD Plugin', () => {
  describe('verify()', () => {
    it('passes all checks for a valid stamp', async () => {
      const result = await verifyGpsdStamp(VALID_GPSD_STAMP);

      expect(result.valid).toBe(true);
      expect(result.structureValid).toBe(true);
      expect(result.signaturesValid).toBe(true);
      expect(result.signalsConsistent).toBe(true);
    });

    it('fails structure when missing required signals (fix object)', async () => {
      const stamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        signals: { deviceType: 'gps' }, // no fix object
      };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
    });

    it('fails structure when fix mode < 2', async () => {
      const stamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        signals: {
          fix: { mode: 1, lat: 37.7749, lon: -122.4194, alt: 16, satellites: 3 },
        },
      };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
    });

    it('fails structure when satellite count is 0', async () => {
      const stamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        signals: {
          fix: { mode: 3, lat: 37.7749, lon: -122.4194, alt: 16, satellites: 0 },
        },
      };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
    });

    it('fails when signature value is empty', async () => {
      const stamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        signatures: [{ ...VALID_GPSD_STAMP.signatures[0], value: '' }],
      };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
    });

    it('fails when signer is missing', async () => {
      const stamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        signatures: [
          {
            ...VALID_GPSD_STAMP.signatures[0],
            signer: { scheme: '', value: '' },
          },
        ],
      };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
    });

    it('fails when signature recovers to wrong address', async () => {
      const { signatures: _, ...unsigned } = VALID_GPSD_STAMP;
      const stamp = signStampWrongSigner(unsigned, Math.floor(Date.now() / 1000));

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signaturesValid).toBe(false);
      expect(result.details.stampSignatureMismatch).toBeDefined();
    });

    it('fails when coordinates are out of range', async () => {
      const stamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        location: { type: 'Point', coordinates: [200, 37.7749] },
      };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.signalsConsistent).toBe(false);
      expect(result.details.signalError).toContain('out of range');
    });

    it('fails when lpVersion is wrong', async () => {
      const stamp: LocationStamp = { ...VALID_GPSD_STAMP, lpVersion: '0.1' };

      const result = await verifyGpsdStamp(stamp);

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
    });
  });

  describe('evaluate()', () => {
    it('computes distance, overlap, and within-radius for matching stamp', async () => {
      const result = await evaluateGpsdStamp(VALID_GPSD_STAMP, VALID_CLAIM);

      expect(result.distanceMeters).toBeCloseTo(0, 0);
      expect(result.temporalOverlap).toBe(1.0);
      expect(result.withinRadius).toBe(true);
    });

    it('computes correct distance for distant stamp', async () => {
      const distantStamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        location: { type: 'Point', coordinates: [-122.5, 37.8] },
      };

      const result = await evaluateGpsdStamp(distantStamp, VALID_CLAIM);

      expect(result.distanceMeters).toBeGreaterThan(1000);
      expect(result.withinRadius).toBe(false);
    });

    it('computes zero temporal overlap for non-overlapping stamp', async () => {
      const oldStamp: LocationStamp = {
        ...VALID_GPSD_STAMP,
        temporalFootprint: { start: now() - 7200, end: now() - 3600 },
      };

      const result = await evaluateGpsdStamp(oldStamp, VALID_CLAIM);

      expect(result.temporalOverlap).toBe(0);
    });
  });
});

// Helper to get current time matching fixture convention
function now(): number {
  return Math.floor(Date.now() / 1000);
}
