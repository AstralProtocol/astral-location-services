/**
 * Edge case integration tests for spatial operations.
 *
 * Tests geographic edge cases that naive implementations often get wrong:
 * - Antimeridian (180°/-180° longitude) crossing
 * - Polar regions
 * - Boundary conditions (point on edge/vertex)
 * - Polygons with holes
 * - Self-intersecting polygons
 * - Precision limits
 *
 * NOTE: GeoJSON coordinates are WGS84 (EPSG:4326) by specification.
 * Coordinates in other CRS will produce incorrect results.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../../helpers/test-server.js';
import {
  GOLDEN_GATE_PARK,
  ANTIMERIDIAN_LINE,
  ANTIMERIDIAN_POLYGON,
  NORTH_POLE_POINT,
  SOUTH_POLE_POINT,
  ANTIPODAL_POINT_A,
  ANTIPODAL_POINT_B,
  NULL_ISLAND,
  POLYGON_WITH_HOLE,
  POINT_ON_BOUNDARY,
  POINT_ON_VERTEX,
  POINT_IN_PARK,
  SELF_INTERSECTING_POLYGON,
  TINY_POLYGON,
  CLOSE_POINT_A,
  CLOSE_POINT_B,
  POSSIBLY_UTM_POINT,
  SF_POINT,
  makeRequest,
} from '../../fixtures/geometries.js';

const app = createTestApp();

describe('Edge Cases', () => {
  describe('Antimeridian crossing', () => {
    it('computes length of line crossing antimeridian', async () => {
      const res = await request(app)
        .post('/compute/v0/length')
        .send(makeRequest({ geometry: ANTIMERIDIAN_LINE }));

      expect(res.status).toBe(200);
      // Line from 170°E to 170°W should be ~20° of longitude at equator
      // At equator, 1° longitude ≈ 111 km, so ~2,220 km
      // But going the SHORT way (across antimeridian) is only ~20° = ~2,220 km
      // Going the LONG way would be ~340° = ~37,700 km
      // PostGIS should take the short way
      expect(res.body.result).toBeGreaterThan(2_000_000);
      expect(res.body.result).toBeLessThan(3_000_000);
    });

    it('computes area of polygon crossing antimeridian', async () => {
      const res = await request(app)
        .post('/compute/v0/area')
        .send(makeRequest({ geometry: ANTIMERIDIAN_POLYGON }));

      expect(res.status).toBe(200);
      // Should return a reasonable area, not a huge number from wrapping
      expect(res.body.result).toBeGreaterThan(0);
      expect(res.body.result).toBeLessThan(1_000_000_000_000); // Less than 1M km²
    });
  });

  describe('Polar regions', () => {
    it('computes distance between polar points', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: NORTH_POLE_POINT, to: SOUTH_POLE_POINT }));

      expect(res.status).toBe(200);
      // North to South pole ≈ 20,000 km (half Earth circumference)
      expect(res.body.result).toBeGreaterThan(19_000_000);
      expect(res.body.result).toBeLessThan(21_000_000);
    });

    it('computes distance from SF to North Pole', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NORTH_POLE_POINT }));

      expect(res.status).toBe(200);
      // SF (37.7°N) to North Pole (89.9°N) ≈ 52° latitude ≈ 5,800 km
      expect(res.body.result).toBeGreaterThan(5_500_000);
      expect(res.body.result).toBeLessThan(6_500_000);
    });
  });

  describe('Antipodal points', () => {
    it('computes distance between antipodal points (max Earth distance)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: ANTIPODAL_POINT_A, to: ANTIPODAL_POINT_B }));

      expect(res.status).toBe(200);
      // Antipodal points should be ~20,000 km apart (half circumference)
      expect(res.body.result).toBeGreaterThan(19_500_000);
      expect(res.body.result).toBeLessThan(20_500_000);
    });
  });

  describe('Null Island (0,0)', () => {
    it('accepts Null Island as valid coordinate', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: NULL_ISLAND, to: SF_POINT }));

      expect(res.status).toBe(200);
      // 0,0 to SF should be a valid distance
      expect(res.body.result).toBeGreaterThan(0);
    });
  });

  describe('Polygons with holes', () => {
    it('computes area of polygon with hole (donut)', async () => {
      const res = await request(app)
        .post('/compute/v0/area')
        .send(makeRequest({ geometry: POLYGON_WITH_HOLE }));

      expect(res.status).toBe(200);
      // Area should be outer area minus hole area
      // Should be less than if we ignored the hole
      expect(res.body.result).toBeGreaterThan(0);
    });

    it('point in hole is NOT contained by polygon', async () => {
      const pointInHole = { type: 'Point', coordinates: [-122.45, 37.775] };
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: POLYGON_WITH_HOLE, containee: pointInHole }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);
    });

    it('point in solid part IS contained by polygon with hole', async () => {
      const pointInSolid = { type: 'Point', coordinates: [-122.49, 37.76] };
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: POLYGON_WITH_HOLE, containee: pointInSolid }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });
  });

  describe('Boundary conditions', () => {
    it('point on polygon boundary - contains behavior', async () => {
      // PostGIS ST_Contains returns FALSE for points on boundary
      // (boundary is not part of the interior)
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: GOLDEN_GATE_PARK, containee: POINT_ON_BOUNDARY }));

      expect(res.status).toBe(200);
      // Document actual PostGIS behavior (may be false)
      expect(typeof res.body.result).toBe('boolean');
    });

    it('point on polygon vertex - contains behavior', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: GOLDEN_GATE_PARK, containee: POINT_ON_VERTEX }));

      expect(res.status).toBe(200);
      expect(typeof res.body.result).toBe('boolean');
    });

    it('point clearly inside polygon IS contained', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: GOLDEN_GATE_PARK, containee: POINT_IN_PARK }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);
    });
  });

  describe('Self-intersecting polygons', () => {
    it('handles self-intersecting (bowtie) polygon', async () => {
      // PostGIS accepts self-intersecting polygons but results may be unexpected
      const res = await request(app)
        .post('/compute/v0/area')
        .send(makeRequest({ geometry: SELF_INTERSECTING_POLYGON }));

      // Should not error - PostGIS handles it
      expect(res.status).toBe(200);
      // Area might be zero or weird due to self-intersection
      expect(typeof res.body.result).toBe('number');
    });
  });

  describe('Precision limits', () => {
    it('computes area of tiny polygon (~1m²)', async () => {
      const res = await request(app)
        .post('/compute/v0/area')
        .send(makeRequest({ geometry: TINY_POLYGON }));

      expect(res.status).toBe(200);
      // Should return a small but non-zero area
      expect(res.body.result).toBeGreaterThan(0);
      expect(res.body.result).toBeLessThan(100); // Less than 100 m²
    });

    it('computes distance between very close points (~1m)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: CLOSE_POINT_A, to: CLOSE_POINT_B }));

      expect(res.status).toBe(200);
      // ~1.1 meters apart
      expect(res.body.result).toBeGreaterThan(0.5);
      expect(res.body.result).toBeLessThan(5);
    });
  });

  describe('CRS / coordinate order issues', () => {
    it('rejects swapped lat/lon when latitude is out of range', async () => {
      // [37.7749, -122.4194] has longitude in latitude position
      // -122.4194 is outside valid latitude range (-90 to 90)
      // Coordinate validation catches this common user error!
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: POSSIBLY_UTM_POINT, to: SF_POINT }));

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('-90');
    });

    it('accepts coordinates that look swapped but are valid', async () => {
      // [37.7749, 37.7749] is valid (longitude 37.7749, latitude 37.7749)
      // Could be swapped, but we can't tell - both values are in valid ranges
      const ambiguousPoint = { type: 'Point', coordinates: [37.7749, 37.7749] };
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: ambiguousPoint, to: SF_POINT }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBeGreaterThan(0);
    });
  });
});
