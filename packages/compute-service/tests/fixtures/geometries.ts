/**
 * Test fixtures for geospatial operations.
 *
 * Known values for verification:
 * - SF to NYC: ~4,130 km (great circle distance)
 * - Golden Gate Park: ~4.1 km^2 (actual is ~4.12 km^2)
 */

// Points
export const SF_POINT = {
  type: 'Point' as const,
  coordinates: [-122.4194, 37.7749], // San Francisco
};

export const NYC_POINT = {
  type: 'Point' as const,
  coordinates: [-73.9857, 40.7484], // New York City (Empire State Building)
};

export const LONDON_POINT = {
  type: 'Point' as const,
  coordinates: [-0.1276, 51.5074], // London
};

// Point inside Golden Gate Park
export const POINT_IN_PARK = {
  type: 'Point' as const,
  coordinates: [-122.48, 37.772],
};

// Point outside park but nearby
export const POINT_NEAR_PARK = {
  type: 'Point' as const,
  coordinates: [-122.42, 37.77],
};

// Polygons
export const GOLDEN_GATE_PARK = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.5108, 37.7694],
    [-122.4534, 37.7694],
    [-122.4534, 37.7749],
    [-122.5108, 37.7749],
    [-122.5108, 37.7694], // Closed ring
  ]],
};

// Overlapping polygon (intersects with Golden Gate Park)
export const OVERLAPPING_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.49, 37.77],
    [-122.46, 37.77],
    [-122.46, 37.78],
    [-122.49, 37.78],
    [-122.49, 37.77],
  ]],
};

// Disjoint polygon (does not intersect)
export const DISJOINT_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.40, 37.80],
    [-122.38, 37.80],
    [-122.38, 37.82],
    [-122.40, 37.82],
    [-122.40, 37.80],
  ]],
};

// MultiPolygon - two separate parks (for area tests)
export const TWO_PARKS_MULTIPOLYGON = {
  type: 'MultiPolygon' as const,
  coordinates: [
    // First park (small square)
    [[
      [-122.52, 37.76],
      [-122.51, 37.76],
      [-122.51, 37.77],
      [-122.52, 37.77],
      [-122.52, 37.76],
    ]],
    // Second park (small square nearby)
    [[
      [-122.50, 37.76],
      [-122.49, 37.76],
      [-122.49, 37.77],
      [-122.50, 37.77],
      [-122.50, 37.76],
    ]],
  ],
};

// Lines
export const SIMPLE_LINE = {
  type: 'LineString' as const,
  coordinates: [
    [-122.4194, 37.7749],
    [-122.4294, 37.7849],
    [-122.4394, 37.7749],
  ],
};

// Invalid geometries for error testing
export const INVALID_COORDINATES_OUT_OF_RANGE = {
  type: 'Point' as const,
  coordinates: [200, 100], // Invalid: lon > 180, lat > 90
};

export const INVALID_LONGITUDE = {
  type: 'Point' as const,
  coordinates: [-181, 37], // Invalid: lon < -180
};

export const INVALID_LATITUDE = {
  type: 'Point' as const,
  coordinates: [-122, 91], // Invalid: lat > 90
};

export const UNCLOSED_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.5, 37.7],
    [-122.4, 37.7],
    [-122.4, 37.8],
    [-122.5, 37.8],
    // Missing closing coordinate
  ]],
};

export const INSUFFICIENT_LINE_POINTS = {
  type: 'LineString' as const,
  coordinates: [[-122.4, 37.7]], // Needs at least 2 points
};

// Request fixtures
export const TEST_SCHEMA_UID = '0x0000000000000000000000000000000000000000000000000000000000000001';
export const TEST_RECIPIENT = '0x0000000000000000000000000000000000000001';
export const TEST_CHAIN_ID = 84532; // Base Sepolia

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Base request for all endpoints
export function makeRequest(body: Record<string, unknown>) {
  return {
    chainId: TEST_CHAIN_ID,
    schema: TEST_SCHEMA_UID,
    recipient: TEST_RECIPIENT,
    ...body,
  };
}
