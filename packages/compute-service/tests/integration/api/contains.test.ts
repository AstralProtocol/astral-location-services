/**
 * Integration tests for /compute/v0/contains endpoint.
 *
 * Tests point-in-polygon and geometry containment operations.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-server.js';
import {
  GOLDEN_GATE_PARK,
  POINT_IN_PARK,
  POINT_NEAR_PARK,
  SF_POINT,
  POLYGON_WITH_HOLE,
  POINT_ON_BOUNDARY,
  POINT_ON_VERTEX,
  TWO_PARKS_MULTIPOLYGON,
  makeRequest,
} from '../../fixtures/geometries.js';

const app = createTestApp();

describe('POST /compute/v0/contains', () => {
  describe('successful computations', () => {
    it('returns true when point is inside polygon', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: POINT_IN_PARK,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
      expect(res.body.operation).toBe('contains');
    });

    it('returns false when point is outside polygon', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: POINT_NEAR_PARK,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });

    it('returns false when point is far outside polygon', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: SF_POINT, // Downtown SF, not in the park
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });

    it('returns correct attestation structure', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: POINT_IN_PARK,
        }));

      expect(res.status).toBe(200);

      // Check response structure
      expect(res.body.timestamp).toBeTypeOf('number');
      expect(res.body.inputRefs).toHaveLength(2);
      expect(res.body.inputRefs[0]).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.body.inputRefs[1]).toMatch(/^0x[a-f0-9]{64}$/);

      // Check attestation
      expect(res.body.attestation).toBeDefined();
      expect(res.body.attestation.attester).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(res.body.attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/);

      // Check delegated attestation
      expect(res.body.delegatedAttestation).toBeDefined();
      expect(res.body.delegatedAttestation.deadline).toBeTypeOf('number');
    });
  });

  describe('polygon with hole (donut)', () => {
    // Point in the "donut" part (between outer ring and hole)
    const POINT_IN_DONUT = {
      type: 'Point' as const,
      coordinates: [-122.41, 37.77],
    };

    // Point inside the hole
    const POINT_IN_HOLE = {
      type: 'Point' as const,
      coordinates: [-122.45, 37.775],
    };

    // Point completely outside
    const POINT_OUTSIDE = {
      type: 'Point' as const,
      coordinates: [-122.35, 37.77],
    };

    it('returns true for point in donut part (between outer and hole)', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: POLYGON_WITH_HOLE,
          containee: POINT_IN_DONUT,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });

    it('returns false for point inside the hole', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: POLYGON_WITH_HOLE,
          containee: POINT_IN_HOLE,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });

    it('returns false for point completely outside', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: POLYGON_WITH_HOLE,
          containee: POINT_OUTSIDE,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });
  });

  describe('multipolygon support', () => {
    // Point inside first polygon of the multipolygon
    const POINT_IN_FIRST = {
      type: 'Point' as const,
      coordinates: [-122.515, 37.765],
    };

    // Point inside second polygon of the multipolygon
    const POINT_IN_SECOND = {
      type: 'Point' as const,
      coordinates: [-122.495, 37.765],
    };

    // Point between the two polygons (should be outside)
    const POINT_BETWEEN = {
      type: 'Point' as const,
      coordinates: [-122.505, 37.765],
    };

    it('returns true for point in first polygon', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: TWO_PARKS_MULTIPOLYGON,
          containee: POINT_IN_FIRST,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });

    it('returns true for point in second polygon', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: TWO_PARKS_MULTIPOLYGON,
          containee: POINT_IN_SECOND,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });

    it('returns false for point between polygons', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: TWO_PARKS_MULTIPOLYGON,
          containee: POINT_BETWEEN,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });
  });

  describe('boundary conditions', () => {
    it('handles point exactly on polygon boundary', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: POINT_ON_BOUNDARY,
        }));

      expect(res.status).toBe(200);
      // PostGIS ST_Contains returns false for points on boundary
      // (use ST_Covers for inclusive boundary check)
      expect(res.body.result).toBe(false);
    });

    it('handles point exactly on polygon vertex', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: POINT_ON_VERTEX,
        }));

      expect(res.status).toBe(200);
      // PostGIS ST_Contains returns false for points on vertex
      expect(res.body.result).toBe(false);
    });
  });

  describe('validation errors', () => {
    it('rejects missing container', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          containee: POINT_IN_PARK,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects missing containee', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
        }));

      expect(res.status).toBe(400);
    });

    it('rejects invalid geometry', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: { type: 'Point', coordinates: [200, 100] }, // invalid coords
          containee: POINT_IN_PARK,
        }));

      expect(res.status).toBe(400);
    });
  });
});
