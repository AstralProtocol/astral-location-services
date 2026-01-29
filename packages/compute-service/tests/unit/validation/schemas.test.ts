import { describe, it, expect } from 'vitest';
import {
  GeometrySchema,
  InputSchema,
  ChainIdSchema,
  SchemaUidSchema,
  RecipientSchema,
  DistanceRequestSchema,
  AreaRequestSchema,
  LengthRequestSchema,
  ContainsRequestSchema,
  WithinRequestSchema,
  IntersectsRequestSchema,
} from '../../../src/validation/schemas.js';
import {
  SF_POINT,
  NYC_POINT,
  GOLDEN_GATE_PARK,
  SIMPLE_LINE,
  TWO_PARKS_MULTIPOLYGON,
  INVALID_COORDINATES_OUT_OF_RANGE,
  INVALID_LONGITUDE,
  INVALID_LATITUDE,
  UNCLOSED_POLYGON,
  INSUFFICIENT_LINE_POINTS,
  TEST_SCHEMA_UID,
  TEST_RECIPIENT,
  TEST_CHAIN_ID,
  makeRequest,
} from '../../fixtures/geometries.js';

describe('Validation Schemas', () => {
  describe('GeometrySchema', () => {
    it('accepts valid Point', () => {
      const result = GeometrySchema.safeParse(SF_POINT);
      expect(result.success).toBe(true);
    });

    it('accepts valid Polygon', () => {
      const result = GeometrySchema.safeParse(GOLDEN_GATE_PARK);
      expect(result.success).toBe(true);
    });

    it('accepts valid LineString', () => {
      const result = GeometrySchema.safeParse(SIMPLE_LINE);
      expect(result.success).toBe(true);
    });

    it('accepts Point with altitude', () => {
      const pointWithAlt = { type: 'Point', coordinates: [-122.4, 37.7, 100] };
      const result = GeometrySchema.safeParse(pointWithAlt);
      expect(result.success).toBe(true);
    });

    it('rejects coordinates out of range (lon > 180)', () => {
      const result = GeometrySchema.safeParse(INVALID_COORDINATES_OUT_OF_RANGE);
      expect(result.success).toBe(false);
    });

    it('rejects longitude < -180', () => {
      const result = GeometrySchema.safeParse(INVALID_LONGITUDE);
      expect(result.success).toBe(false);
    });

    it('rejects latitude > 90', () => {
      const result = GeometrySchema.safeParse(INVALID_LATITUDE);
      expect(result.success).toBe(false);
    });

    it('rejects latitude < -90', () => {
      const point = { type: 'Point', coordinates: [-122, -91] };
      const result = GeometrySchema.safeParse(point);
      expect(result.success).toBe(false);
    });

    it('rejects LineString with insufficient points', () => {
      const result = GeometrySchema.safeParse(INSUFFICIENT_LINE_POINTS);
      expect(result.success).toBe(false);
    });

    it('rejects Polygon with < 4 points in ring', () => {
      // Schema requires min 4 points but doesn't validate closure
      const tooFewPoints = {
        type: 'Polygon',
        coordinates: [[[-122.5, 37.7], [-122.4, 37.7], [-122.4, 37.8]]],
      };
      const result = GeometrySchema.safeParse(tooFewPoints);
      expect(result.success).toBe(false);
    });

    it('accepts Polygon with 4+ points (closure not validated by schema)', () => {
      // Note: GeoJSON spec requires closure, but schema only checks point count
      // PostGIS handles closure validation
      const result = GeometrySchema.safeParse(UNCLOSED_POLYGON);
      expect(result.success).toBe(true);
    });

    it('rejects unknown geometry type', () => {
      const unknown = { type: 'Circle', coordinates: [0, 0] };
      const result = GeometrySchema.safeParse(unknown);
      expect(result.success).toBe(false);
    });

    it('accepts MultiPoint', () => {
      const multiPoint = {
        type: 'MultiPoint',
        coordinates: [[-122.4, 37.7], [-122.5, 37.8]],
      };
      const result = GeometrySchema.safeParse(multiPoint);
      expect(result.success).toBe(true);
    });

    it('accepts GeometryCollection', () => {
      const collection = {
        type: 'GeometryCollection',
        geometries: [SF_POINT, SIMPLE_LINE],
      };
      const result = GeometrySchema.safeParse(collection);
      expect(result.success).toBe(true);
    });

    it('accepts MultiPolygon', () => {
      const result = GeometrySchema.safeParse(TWO_PARKS_MULTIPOLYGON);
      expect(result.success).toBe(true);
    });

    it('accepts MultiLineString', () => {
      const multiLine = {
        type: 'MultiLineString',
        coordinates: [
          [[-122.4, 37.7], [-122.5, 37.8]],
          [[-122.3, 37.6], [-122.4, 37.7]],
        ],
      };
      const result = GeometrySchema.safeParse(multiLine);
      expect(result.success).toBe(true);
    });
  });

  describe('InputSchema', () => {
    it('accepts raw GeoJSON geometry', () => {
      const result = InputSchema.safeParse(SF_POINT);
      expect(result.success).toBe(true);
    });

    it('accepts UID reference', () => {
      const uidRef = { uid: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' };
      const result = InputSchema.safeParse(uidRef);
      expect(result.success).toBe(true);
    });

    it('accepts UID with URI', () => {
      const uidWithUri = {
        uid: '0x1234',
        uri: 'https://eas.example.com/attestation/0x1234',
      };
      const result = InputSchema.safeParse(uidWithUri);
      expect(result.success).toBe(true);
    });

    it('accepts UID with extra properties (union matches uid-only pattern)', () => {
      // Note: z.union tries all options - {uid, uri} with invalid URI
      // matches the {uid: string} pattern (extra props ignored by default)
      const uidWithBadUri = {
        uid: '0x1234',
        uri: 'not-a-valid-url',
      };
      const result = InputSchema.safeParse(uidWithBadUri);
      expect(result.success).toBe(true);
    });
  });

  describe('ChainIdSchema', () => {
    it('accepts positive integer', () => {
      const result = ChainIdSchema.safeParse(84532);
      expect(result.success).toBe(true);
    });

    it('rejects zero', () => {
      const result = ChainIdSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('rejects negative', () => {
      const result = ChainIdSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('rejects non-integer', () => {
      const result = ChainIdSchema.safeParse(1.5);
      expect(result.success).toBe(false);
    });
  });

  describe('SchemaUidSchema', () => {
    it('accepts valid 64-character hex with 0x prefix', () => {
      const result = SchemaUidSchema.safeParse(TEST_SCHEMA_UID);
      expect(result.success).toBe(true);
    });

    it('rejects without 0x prefix', () => {
      const result = SchemaUidSchema.safeParse('0000000000000000000000000000000000000000000000000000000000000001');
      expect(result.success).toBe(false);
    });

    it('rejects wrong length', () => {
      const result = SchemaUidSchema.safeParse('0x1234');
      expect(result.success).toBe(false);
    });

    it('rejects invalid hex characters', () => {
      const result = SchemaUidSchema.safeParse('0xgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg');
      expect(result.success).toBe(false);
    });
  });

  describe('RecipientSchema', () => {
    it('accepts valid Ethereum address', () => {
      const result = RecipientSchema.safeParse(TEST_RECIPIENT);
      expect(result.success).toBe(true);
    });

    it('defaults to zero address when undefined', () => {
      const result = RecipientSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBe('0x0000000000000000000000000000000000000000');
    });

    it('rejects invalid address format', () => {
      const result = RecipientSchema.safeParse('0x123');
      expect(result.success).toBe(false);
    });
  });

  describe('DistanceRequestSchema', () => {
    it('accepts valid distance request', () => {
      const request = makeRequest({ from: SF_POINT, to: NYC_POINT });
      const result = DistanceRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('rejects missing from', () => {
      const request = makeRequest({ to: NYC_POINT });
      const result = DistanceRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects missing chainId', () => {
      const request = { from: SF_POINT, to: NYC_POINT, schema: TEST_SCHEMA_UID };
      const result = DistanceRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects invalid geometry in from', () => {
      const request = makeRequest({ from: INVALID_COORDINATES_OUT_OF_RANGE, to: NYC_POINT });
      const result = DistanceRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('AreaRequestSchema', () => {
    it('accepts valid area request', () => {
      const request = makeRequest({ geometry: GOLDEN_GATE_PARK });
      const result = AreaRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('rejects missing geometry', () => {
      const request = makeRequest({});
      const result = AreaRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('LengthRequestSchema', () => {
    it('accepts valid length request', () => {
      const request = makeRequest({ geometry: SIMPLE_LINE });
      const result = LengthRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('ContainsRequestSchema', () => {
    it('accepts valid contains request', () => {
      const request = makeRequest({ container: GOLDEN_GATE_PARK, containee: SF_POINT });
      const result = ContainsRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('rejects missing container', () => {
      const request = makeRequest({ containee: SF_POINT });
      const result = ContainsRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('WithinRequestSchema', () => {
    it('accepts valid within request', () => {
      const request = makeRequest({ geometry: SF_POINT, target: GOLDEN_GATE_PARK, radius: 5000 });
      const result = WithinRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('rejects negative radius', () => {
      const request = makeRequest({ geometry: SF_POINT, target: GOLDEN_GATE_PARK, radius: -100 });
      const result = WithinRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects zero radius', () => {
      const request = makeRequest({ geometry: SF_POINT, target: GOLDEN_GATE_PARK, radius: 0 });
      const result = WithinRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('rejects missing radius', () => {
      const request = makeRequest({ geometry: SF_POINT, target: GOLDEN_GATE_PARK });
      const result = WithinRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('IntersectsRequestSchema', () => {
    it('accepts valid intersects request', () => {
      const request = makeRequest({ geometry1: GOLDEN_GATE_PARK, geometry2: SF_POINT });
      const result = IntersectsRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('rejects missing geometry2', () => {
      const request = makeRequest({ geometry1: GOLDEN_GATE_PARK });
      const result = IntersectsRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});
