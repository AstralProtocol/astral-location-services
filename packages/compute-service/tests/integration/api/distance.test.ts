/**
 * Integration tests for /compute/v0/distance endpoint.
 *
 * NOTE: Tests use approximate values with tolerances rather than exact assertions.
 * This is intentional for now, but raises an open question:
 *
 * TODO: Research determinism of PostGIS geodesic calculations across environments.
 * For a verifiable computation system, we need to understand whether different
 * PostGIS versions, configurations, or underlying libraries (GEOS, PROJ) produce
 * identical results. If not, we may need to:
 * - Pin exact versions in our Docker image
 * - Document the expected computation environment
 * - Consider deterministic alternatives for critical calculations
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-server.js';
import {
  SF_POINT,
  NYC_POINT,
  GOLDEN_GATE_PARK,
  makeRequest,
} from '../../fixtures/geometries.js';

const app = createTestApp();

describe('POST /compute/v0/distance', () => {
  describe('successful computations', () => {
    it('computes distance between SF and NYC (~4,130 km)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      // Distance should be approximately 4,130 km (4,130,000 meters)
      // Allow 5% tolerance for geodesic calculation differences
      expect(res.body.result).toBeGreaterThan(3_900_000);
      expect(res.body.result).toBeLessThan(4_400_000);

      // Check response structure
      expect(res.body.units).toBe('meters');
      expect(res.body.operation).toBe('distance');
      expect(res.body.timestamp).toBeTypeOf('number');
      expect(res.body.inputRefs).toHaveLength(2);
      expect(res.body.inputRefs[0]).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.body.inputRefs[1]).toMatch(/^0x[a-f0-9]{64}$/);

      // Check attestation structure
      expect(res.body.attestation).toBeDefined();
      expect(res.body.attestation.attester).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(res.body.attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/); // Combined signature hex
      expect(res.body.attestation.data).toMatch(/^0x[a-fA-F0-9]+$/); // Encoded attestation data

      // Check delegated attestation
      expect(res.body.delegatedAttestation).toBeDefined();
      expect(res.body.delegatedAttestation.signature).toBe(res.body.attestation.signature);
      expect(res.body.delegatedAttestation.attester).toBe(res.body.attestation.attester);
      expect(res.body.delegatedAttestation.deadline).toBeTypeOf('number');
    });

    it('computes distance between two identical points (should be 0)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: SF_POINT }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(0);
    });

    it('computes distance from point to polygon (nearest edge)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: GOLDEN_GATE_PARK }));

      expect(res.status).toBe(200);
      // SF point is east of Golden Gate Park, should be a few km
      expect(res.body.result).toBeGreaterThan(0);
      expect(res.body.result).toBeLessThan(10_000); // Less than 10km
    });

    it('produces consistent input refs for same geometry', async () => {
      const res1 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      const res2 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res1.body.inputRefs[0]).toBe(res2.body.inputRefs[0]);
      expect(res1.body.inputRefs[1]).toBe(res2.body.inputRefs[1]);
    });
  });

  describe('validation errors', () => {
    it('rejects missing chainId', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send({
          from: SF_POINT,
          to: NYC_POINT,
          schema: '0x0000000000000000000000000000000000000000000000000000000000000001',
        });

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('invalid-input');
    });

    it('rejects missing `from` geometry', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ to: NYC_POINT }));

      expect(res.status).toBe(400);
    });

    it('rejects missing `to` geometry', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT }));

      expect(res.status).toBe(400);
    });

    it('rejects invalid coordinates (out of bounds)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({
          from: { type: 'Point', coordinates: [200, 100] },
          to: NYC_POINT,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects invalid schema UID format', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send({
          chainId: 84532,
          from: SF_POINT,
          to: NYC_POINT,
          schema: 'not-a-valid-schema',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('response format', () => {
    it('returns RFC 7807 problem details on error', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT })); // missing 'to'

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        type: expect.stringContaining('astral.global/errors'),
        title: expect.any(String),
        status: 400,
        detail: expect.any(String),
        instance: '/compute/v0/distance',
      });
    });
  });
});
