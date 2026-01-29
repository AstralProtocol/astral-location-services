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

// ===========================================
// EDGE CASE GEOMETRIES
// ===========================================

// Antimeridian crossing - line that crosses 180°/-180° longitude
// This is tricky because naive implementations break here
export const ANTIMERIDIAN_LINE = {
  type: 'LineString' as const,
  coordinates: [
    [170, 0],   // East of antimeridian
    [-170, 0],  // West of antimeridian (crossed!)
  ],
};

// Polygon crossing antimeridian (Fiji straddles the line)
export const ANTIMERIDIAN_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [177, -17],
    [-179, -17],
    [-179, -20],
    [177, -20],
    [177, -17],
  ]],
};

// Polar region - point near North Pole
export const NORTH_POLE_POINT = {
  type: 'Point' as const,
  coordinates: [0, 89.9], // Very close to pole
};

// Polar region - point near South Pole
export const SOUTH_POLE_POINT = {
  type: 'Point' as const,
  coordinates: [0, -89.9],
};

// Antipodal points - opposite sides of Earth (~20,000 km apart)
export const ANTIPODAL_POINT_A = {
  type: 'Point' as const,
  coordinates: [0, 0], // Null Island
};

export const ANTIPODAL_POINT_B = {
  type: 'Point' as const,
  coordinates: [180, 0], // Opposite side
};

// Null Island - 0,0 is a real coordinate, should work
export const NULL_ISLAND = {
  type: 'Point' as const,
  coordinates: [0, 0],
};

// Polygon with hole (donut shape)
// Outer ring is counter-clockwise, hole is clockwise (GeoJSON spec)
export const POLYGON_WITH_HOLE = {
  type: 'Polygon' as const,
  coordinates: [
    // Outer ring
    [
      [-122.5, 37.75],
      [-122.4, 37.75],
      [-122.4, 37.80],
      [-122.5, 37.80],
      [-122.5, 37.75],
    ],
    // Hole (clockwise)
    [
      [-122.48, 37.76],
      [-122.48, 37.79],
      [-122.42, 37.79],
      [-122.42, 37.76],
      [-122.48, 37.76],
    ],
  ],
};

// Point exactly on polygon boundary (edge case for contains)
export const POINT_ON_BOUNDARY = {
  type: 'Point' as const,
  coordinates: [-122.5108, 37.772], // Exactly on west edge of Golden Gate Park
};

// Point on polygon vertex
export const POINT_ON_VERTEX = {
  type: 'Point' as const,
  coordinates: [-122.5108, 37.7694], // SW corner of Golden Gate Park
};

// Self-intersecting polygon (bowtie/figure-8) - technically invalid but PostGIS accepts it
export const SELF_INTERSECTING_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.5, 37.75],
    [-122.4, 37.80],  // These two edges
    [-122.5, 37.80],  // cross each other
    [-122.4, 37.75],
    [-122.5, 37.75],
  ]],
};

// Very small polygon (tests precision limits)
// ~1 meter square
export const TINY_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.4194, 37.7749],
    [-122.4194, 37.77491],      // ~1m north
    [-122.41939, 37.77491],     // ~1m west
    [-122.41939, 37.7749],
    [-122.4194, 37.7749],
  ]],
};

// Two points very close together (tests distance precision)
export const CLOSE_POINT_A = {
  type: 'Point' as const,
  coordinates: [-122.4194, 37.7749],
};

export const CLOSE_POINT_B = {
  type: 'Point' as const,
  coordinates: [-122.4194, 37.77491], // ~1.1 meters north
};

// Coordinates that look like UTM (not WGS84) - large numbers
// These are valid WGS84 but might indicate user error if context suggests UTM
export const POSSIBLY_UTM_POINT = {
  type: 'Point' as const,
  coordinates: [37.7749, -122.4194], // Swapped lat/lon (common mistake)
};

// ===========================================
// INVALID GEOMETRIES FOR ERROR TESTING
// ===========================================

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
