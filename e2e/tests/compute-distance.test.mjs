/**
 * Distance computation tests.
 */
import {
  SF_POINT, NYC_POINT, CLOSE_POINT_A, CLOSE_POINT_B,
  ANTIPODAL_POINT_A, ANTIPODAL_POINT_B,
  INVALID_COORDINATES_OUT_OF_RANGE,
} from '../lib/fixtures.mjs';
import {
  assertNumericResult, assertAttestationStructure, assertStatus,
} from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'compute-distance',
    tests: [
      {
        name: 'distance-sf-nyc',
        fn: async () => {
          const res = await client.compute.distance(SF_POINT, NYC_POINT);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 3_900_000,
              max: 4_400_000,
              units: 'meters',
              operation: 'distance',
            }),
            assertAttestationStructure(res.body),
          ];
        },
      },
      {
        name: 'distance-identical-points',
        fn: async () => {
          const res = await client.compute.distance(SF_POINT, SF_POINT);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 0,
              max: 0.01,
              units: 'meters',
              operation: 'distance',
            }),
          ];
        },
      },
      {
        name: 'distance-close-points',
        fn: async () => {
          const res = await client.compute.distance(CLOSE_POINT_A, CLOSE_POINT_B);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 0.5,
              max: 5,
              units: 'meters',
              operation: 'distance',
            }),
          ];
        },
      },
      {
        name: 'distance-antipodal',
        fn: async () => {
          const res = await client.compute.distance(ANTIPODAL_POINT_A, ANTIPODAL_POINT_B);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 19_000_000,
              max: 20_100_000,
              units: 'meters',
              operation: 'distance',
            }),
          ];
        },
      },
      {
        name: 'distance-invalid-coords-400',
        fn: async () => {
          const res = await client.compute.distance(
            INVALID_COORDINATES_OUT_OF_RANGE,
            SF_POINT
          );
          return [
            assertStatus(res, 400),
          ];
        },
      },
    ],
  };
}
