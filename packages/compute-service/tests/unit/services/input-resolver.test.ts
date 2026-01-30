import { describe, it, expect } from 'vitest';
import { resolveInput, resolveInputs } from '../../../src/services/input-resolver.js';
import { SF_POINT, NYC_POINT, GOLDEN_GATE_PARK } from '../../fixtures/geometries.js';

describe('Input Resolver', () => {
  describe('resolveInput', () => {
    it('returns geometry and ref for raw GeoJSON', async () => {
      const result = await resolveInput(SF_POINT);

      expect(result.geometry).toEqual(SF_POINT);
      expect(result.ref).toMatch(/^0x[a-f0-9]{64}$/); // keccak256 hash
    });

    it('produces consistent hash for same input', async () => {
      const result1 = await resolveInput(SF_POINT);
      const result2 = await resolveInput(SF_POINT);

      expect(result1.ref).toBe(result2.ref);
    });

    it('produces different hashes for different inputs', async () => {
      const resultSF = await resolveInput(SF_POINT);
      const resultNYC = await resolveInput(NYC_POINT);

      expect(resultSF.ref).not.toBe(resultNYC.ref);
    });

    it('produces same hash regardless of property order', async () => {
      // These should produce the same hash due to canonical JSON serialization
      const point1 = { type: 'Point', coordinates: [-122.4, 37.7] };
      const point2 = { coordinates: [-122.4, 37.7], type: 'Point' };

      const result1 = await resolveInput(point1);
      const result2 = await resolveInput(point2);

      expect(result1.ref).toBe(result2.ref);
    });

    it('handles complex polygon', async () => {
      const result = await resolveInput(GOLDEN_GATE_PARK);

      expect(result.geometry).toEqual(GOLDEN_GATE_PARK);
      expect(result.ref).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('throws for onchain UID input without chainId', async () => {
      const uidInput = { uid: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' };

      await expect(resolveInput(uidInput)).rejects.toThrow('chainId is required for onchain UID resolution');
    });

    it('throws for offchain attestation input (not yet implemented)', async () => {
      const offchainInput = {
        uid: '0x1234',
        uri: 'https://eas.example.com/attestation/0x1234',
      };

      await expect(resolveInput(offchainInput)).rejects.toThrow('Offchain attestation resolution not yet implemented');
    });
  });

  describe('resolveInputs', () => {
    it('resolves multiple inputs in parallel', async () => {
      const results = await resolveInputs([SF_POINT, NYC_POINT, GOLDEN_GATE_PARK]);

      expect(results).toHaveLength(3);
      expect(results[0].geometry).toEqual(SF_POINT);
      expect(results[1].geometry).toEqual(NYC_POINT);
      expect(results[2].geometry).toEqual(GOLDEN_GATE_PARK);

      // All should have valid refs
      results.forEach(result => {
        expect(result.ref).toMatch(/^0x[a-f0-9]{64}$/);
      });
    });

    it('returns empty array for empty input', async () => {
      const results = await resolveInputs([]);
      expect(results).toEqual([]);
    });
  });

  describe('hash determinism', () => {
    // These tests verify that the hash is truly deterministic
    // which is critical for attestation verification

    it('nested object properties are sorted', async () => {
      const geo1 = {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      };
      const geo2 = {
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        type: 'Polygon',
      };

      const result1 = await resolveInput(geo1);
      const result2 = await resolveInput(geo2);

      expect(result1.ref).toBe(result2.ref);
    });

    it('array order is preserved (not sorted)', async () => {
      const line1 = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
      const line2 = { type: 'LineString', coordinates: [[1, 1], [0, 0]] };

      const result1 = await resolveInput(line1);
      const result2 = await resolveInput(line2);

      // These should be DIFFERENT because coordinate order matters
      expect(result1.ref).not.toBe(result2.ref);
    });

    it('floating point precision is preserved', async () => {
      const point1 = { type: 'Point', coordinates: [-122.4194, 37.7749] };
      const point2 = { type: 'Point', coordinates: [-122.4194, 37.7749] };

      const result1 = await resolveInput(point1);
      const result2 = await resolveInput(point2);

      expect(result1.ref).toBe(result2.ref);
    });
  });
});
