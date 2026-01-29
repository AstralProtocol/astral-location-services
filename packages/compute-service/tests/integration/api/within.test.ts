/**
 * Integration tests for /compute/v0/within endpoint.
 *
 * Tests proximity/radius checks - "is geometry within X meters of target?"
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-server.js';
import {
  SF_POINT,
  NYC_POINT,
  POINT_IN_PARK,
  POINT_NEAR_PARK,
  GOLDEN_GATE_PARK,
  makeRequest,
} from '../../fixtures/geometries.js';

const app = createTestApp();

describe('POST /compute/v0/within', () => {
  describe('successful computations', () => {
    it('returns true when point is within radius of target', async () => {
      // POINT_IN_PARK and POINT_NEAR_PARK are ~500m apart
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: POINT_NEAR_PARK,
          radius: 10000, // 10km - definitely within
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
      expect(res.body.operation).toMatch(/^within:\d+$/); // e.g., "within:1000000" (cm)
    });

    it('returns false when point is outside radius of target', async () => {
      // SF to NYC is ~4,130 km
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: SF_POINT,
          target: NYC_POINT,
          radius: 1000, // 1km - way too small
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });

    it('returns true when point is exactly at target (0 distance)', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: SF_POINT,
          target: SF_POINT,
          radius: 1, // 1 meter
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });

    it('encodes radius in operation string (centimeters)', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: SF_POINT,
          target: NYC_POINT,
          radius: 500, // 500 meters
        }));

      expect(res.status).toBe(200);
      // 500m = 50000cm
      expect(res.body.operation).toBe('within:50000');
    });

    it('works with polygon as target (checks distance to nearest edge)', async () => {
      // POINT_NEAR_PARK is outside but near Golden Gate Park
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_NEAR_PARK,
          target: GOLDEN_GATE_PARK,
          radius: 5000, // 5km
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });

    it('returns correct attestation structure', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: POINT_NEAR_PARK,
          radius: 1000,
        }));

      expect(res.status).toBe(200);

      // Check response structure
      expect(res.body.timestamp).toBeTypeOf('number');
      expect(res.body.inputRefs).toHaveLength(2);
      expect(res.body.inputRefs[0]).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.body.inputRefs[1]).toMatch(/^0x[a-f0-9]{64}$/);

      // Check attestation structure
      expect(res.body.attestation).toBeDefined();
      expect(res.body.attestation.attester).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(res.body.attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(res.body.attestation.data).toMatch(/^0x[a-fA-F0-9]+$/);

      // Check delegated attestation
      expect(res.body.delegatedAttestation).toBeDefined();
      expect(res.body.delegatedAttestation.deadline).toBeTypeOf('number');
    });
  });

  describe('boundary conditions', () => {
    it('handles very small radius (1 meter)', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: POINT_NEAR_PARK,
          radius: 1, // 1 meter
        }));

      expect(res.status).toBe(200);
      // These points are ~500m apart, so should be false
      expect(res.body.result).toBe(false);
    });

    it('handles large radius (1000 km)', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: SF_POINT,
          target: NYC_POINT,
          radius: 1_000_000, // 1000 km
        }));

      expect(res.status).toBe(200);
      // SF to NYC is ~4,130 km, so 1000km is not enough
      expect(res.body.result).toBe(false);
    });

    it('handles radius that just barely includes the target', async () => {
      // SF to NYC is ~4,130 km
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: SF_POINT,
          target: NYC_POINT,
          radius: 5_000_000, // 5000 km - should include NYC
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('rejects missing geometry', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          target: POINT_NEAR_PARK,
          radius: 1000,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects missing target', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          radius: 1000,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects missing radius', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: POINT_NEAR_PARK,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects negative radius', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: POINT_NEAR_PARK,
          radius: -100,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects zero radius', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: POINT_NEAR_PARK,
          radius: 0,
        }));

      expect(res.status).toBe(400);
    });
  });
});
