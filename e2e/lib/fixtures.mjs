/**
 * Test fixtures for geospatial operations and verify module.
 * Ported from packages/astral-service/tests/fixtures/geometries.ts
 * and packages/astral-service/tests/fixtures/verify.ts
 */

// ===========================================
// POINTS
// ===========================================

export const SF_POINT = {
  type: 'Point',
  coordinates: [-122.4194, 37.7749],
};

export const NYC_POINT = {
  type: 'Point',
  coordinates: [-73.9857, 40.7484],
};

export const LONDON_POINT = {
  type: 'Point',
  coordinates: [-0.1276, 51.5074],
};

export const POINT_IN_PARK = {
  type: 'Point',
  coordinates: [-122.48, 37.772],
};

export const POINT_NEAR_PARK = {
  type: 'Point',
  coordinates: [-122.42, 37.77],
};

// ===========================================
// POLYGONS
// ===========================================

export const GOLDEN_GATE_PARK = {
  type: 'Polygon',
  coordinates: [[
    [-122.5108, 37.7694],
    [-122.4534, 37.7694],
    [-122.4534, 37.7749],
    [-122.5108, 37.7749],
    [-122.5108, 37.7694],
  ]],
};

export const OVERLAPPING_POLYGON = {
  type: 'Polygon',
  coordinates: [[
    [-122.49, 37.77],
    [-122.46, 37.77],
    [-122.46, 37.78],
    [-122.49, 37.78],
    [-122.49, 37.77],
  ]],
};

export const DISJOINT_POLYGON = {
  type: 'Polygon',
  coordinates: [[
    [-122.40, 37.80],
    [-122.38, 37.80],
    [-122.38, 37.82],
    [-122.40, 37.82],
    [-122.40, 37.80],
  ]],
};

export const TWO_PARKS_MULTIPOLYGON = {
  type: 'MultiPolygon',
  coordinates: [
    [[
      [-122.52, 37.76],
      [-122.51, 37.76],
      [-122.51, 37.77],
      [-122.52, 37.77],
      [-122.52, 37.76],
    ]],
    [[
      [-122.50, 37.76],
      [-122.49, 37.76],
      [-122.49, 37.77],
      [-122.50, 37.77],
      [-122.50, 37.76],
    ]],
  ],
};

// ===========================================
// LINES
// ===========================================

export const SIMPLE_LINE = {
  type: 'LineString',
  coordinates: [
    [-122.4194, 37.7749],
    [-122.4294, 37.7849],
    [-122.4394, 37.7749],
  ],
};

// ===========================================
// EDGE CASE GEOMETRIES
// ===========================================

export const ANTIMERIDIAN_LINE = {
  type: 'LineString',
  coordinates: [
    [170, 0],
    [-170, 0],
  ],
};

export const ANTIMERIDIAN_POLYGON = {
  type: 'Polygon',
  coordinates: [[
    [177, -17],
    [-179, -17],
    [-179, -20],
    [177, -20],
    [177, -17],
  ]],
};

export const NORTH_POLE_POINT = {
  type: 'Point',
  coordinates: [0, 89.9],
};

export const SOUTH_POLE_POINT = {
  type: 'Point',
  coordinates: [0, -89.9],
};

export const ANTIPODAL_POINT_A = {
  type: 'Point',
  coordinates: [0, 0],
};

export const ANTIPODAL_POINT_B = {
  type: 'Point',
  coordinates: [180, 0],
};

export const NULL_ISLAND = {
  type: 'Point',
  coordinates: [0, 0],
};

export const POLYGON_WITH_HOLE = {
  type: 'Polygon',
  coordinates: [
    [
      [-122.5, 37.75],
      [-122.4, 37.75],
      [-122.4, 37.80],
      [-122.5, 37.80],
      [-122.5, 37.75],
    ],
    [
      [-122.48, 37.76],
      [-122.48, 37.79],
      [-122.42, 37.79],
      [-122.42, 37.76],
      [-122.48, 37.76],
    ],
  ],
};

export const POINT_ON_BOUNDARY = {
  type: 'Point',
  coordinates: [-122.5108, 37.772],
};

export const POINT_ON_VERTEX = {
  type: 'Point',
  coordinates: [-122.5108, 37.7694],
};

export const TINY_POLYGON = {
  type: 'Polygon',
  coordinates: [[
    [-122.4194, 37.7749],
    [-122.4194, 37.77491],
    [-122.41939, 37.77491],
    [-122.41939, 37.7749],
    [-122.4194, 37.7749],
  ]],
};

export const CLOSE_POINT_A = {
  type: 'Point',
  coordinates: [-122.4194, 37.7749],
};

export const CLOSE_POINT_B = {
  type: 'Point',
  coordinates: [-122.4194, 37.77491],
};

// ===========================================
// INVALID GEOMETRIES
// ===========================================

export const INVALID_COORDINATES_OUT_OF_RANGE = {
  type: 'Point',
  coordinates: [200, 100],
};

export const INVALID_LONGITUDE = {
  type: 'Point',
  coordinates: [-181, 37],
};

export const INVALID_LATITUDE = {
  type: 'Point',
  coordinates: [-122, 91],
};

export const UNCLOSED_POLYGON = {
  type: 'Polygon',
  coordinates: [[
    [-122.5, 37.7],
    [-122.4, 37.7],
    [-122.4, 37.8],
    [-122.5, 37.8],
  ]],
};

export const INSUFFICIENT_LINE_POINTS = {
  type: 'LineString',
  coordinates: [[-122.4, 37.7]],
};

// ===========================================
// REQUEST HELPERS
// ===========================================

export const TEST_SCHEMA_UID = '0x0000000000000000000000000000000000000000000000000000000000000001';
export const TEST_RECIPIENT = '0x0000000000000000000000000000000000000001';
export const TEST_CHAIN_ID = 84532; // Base Sepolia

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function makeRequest(body) {
  return {
    chainId: TEST_CHAIN_ID,
    schema: TEST_SCHEMA_UID,
    recipient: TEST_RECIPIENT,
    ...body,
  };
}

// ===========================================
// VERIFY FIXTURES
// ===========================================

const WGS84_SRS = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';
const now = Math.floor(Date.now() / 1000);

export const VALID_CLAIM = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  srs: WGS84_SRS,
  subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
  radius: 100,
  time: { start: now - 60, end: now },
  eventType: 'presence',
};

export const VALID_STAMP = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  srs: WGS84_SRS,
  temporalFootprint: { start: now - 120, end: now + 60 },
  plugin: 'proofmode',
  pluginVersion: '0.1.0',
  signals: {
    deviceType: 'mobile',
    accuracy: 10,
  },
  signatures: [
    {
      signer: { scheme: 'device-pubkey', value: '0xabcdef1234567890' },
      algorithm: 'secp256k1',
      value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00',
      timestamp: now - 30,
    },
  ],
};

export const VALID_PROOF = {
  claim: VALID_CLAIM,
  stamps: [VALID_STAMP],
};

export const STAMP_OUTSIDE_RADIUS = {
  ...VALID_STAMP,
  location: { type: 'Point', coordinates: [-122.5, 37.8] },
};

export const STAMP_TEMPORAL_MISMATCH = {
  ...VALID_STAMP,
  temporalFootprint: { start: now - 3600, end: now - 1800 },
};

export const STAMP_INVALID_SIGNATURE = {
  ...VALID_STAMP,
  signatures: [
    {
      ...VALID_STAMP.signatures[0],
      value: 'not-a-hex-signature',
    },
  ],
};

export const VALID_STAMP_SECOND = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4195, 37.775] },
  srs: WGS84_SRS,
  temporalFootprint: { start: now - 90, end: now + 30 },
  plugin: 'proofmode',
  pluginVersion: '0.1.0',
  signals: {
    deviceType: 'tablet',
    accuracy: 15,
    session: 2,
  },
  signatures: [
    {
      signer: { scheme: 'device-pubkey', value: '0x9876543210fedcba' },
      algorithm: 'secp256k1',
      value: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba098765432100',
      timestamp: now - 45,
    },
  ],
};

export const MULTI_STAMP_PROOF = {
  claim: VALID_CLAIM,
  stamps: [VALID_STAMP, VALID_STAMP_SECOND],
};

export const NYC_CLAIM = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
  srs: WGS84_SRS,
  subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
  radius: 50,
  time: { start: now - 60, end: now },
  eventType: 'presence',
};

export function makeVerifyRequest(proof, options) {
  return {
    proof,
    options: {
      chainId: TEST_CHAIN_ID,
      schema: TEST_SCHEMA_UID,
      recipient: TEST_RECIPIENT,
      ...options,
    },
  };
}

export function makeStampRequest(stamp) {
  return { stamp };
}

// ===========================================
// ONCHAIN CONSTANTS
// ===========================================

export const EAS_ADDRESS = '0x4200000000000000000000000000000000000021';

// Registered schemas on Base Sepolia (canonical UIDs from .env.example)
export const NUMERIC_SCHEMA_UID = '0xc2b013ecb68d59b28f5d301203ec630335d97c37b400b16b359db6972572e02a';
export const BOOLEAN_SCHEMA_UID = '0x4958625091a773dcfb37a1c33099a378f32a975a7fb61f33d53c4be7589898f5';

export const EAS_ABI = [
  `function attestByDelegation(
    tuple(
      bytes32 schema,
      tuple(
        address recipient,
        uint64 expirationTime,
        bool revocable,
        bytes32 refUID,
        bytes data,
        uint256 value
      ) data,
      tuple(uint8 v, bytes32 r, bytes32 s) signature,
      address attester,
      uint64 deadline
    ) delegatedRequest
  ) external payable returns (bytes32)`,
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
];
