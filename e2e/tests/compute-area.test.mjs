/**
 * Area computation tests.
 */
import {
  GOLDEN_GATE_PARK, POLYGON_WITH_HOLE, TINY_POLYGON,
  INVALID_COORDINATES_OUT_OF_RANGE,
} from '../lib/fixtures.mjs';
import {
  assertNumericResult, assertAttestationStructure, assertStatus,
} from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'compute-area',
    tests: [
      {
        name: 'area-golden-gate-park',
        fn: async () => {
          const res = await client.compute.area(GOLDEN_GATE_PARK);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 200_000,
              max: 5_000_000,
              units: 'square_meters',
              operation: 'area',
            }),
            assertAttestationStructure(res.body),
          ];
        },
      },
      {
        name: 'area-polygon-with-hole',
        fn: async () => {
          // Area with hole should be less than without hole
          const resWithHole = await client.compute.area(POLYGON_WITH_HOLE);
          const resNoHole = await client.compute.area({
            type: 'Polygon',
            coordinates: [POLYGON_WITH_HOLE.coordinates[0]],
          });

          const withHole = resWithHole.body.result;
          const noHole = resNoHole.body.result;

          return [
            assertStatus(resWithHole, 200),
            assertStatus(resNoHole, 200),
            {
              pass: withHole < noHole,
              message: withHole < noHole
                ? `Area with hole (${withHole}) < without hole (${noHole})`
                : `Area with hole (${withHole}) >= without hole (${noHole})`,
              details: { withHole, noHole },
            },
          ];
        },
      },
      {
        name: 'area-tiny-polygon',
        fn: async () => {
          const res = await client.compute.area(TINY_POLYGON);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 0,
              max: 10,
              units: 'square_meters',
              operation: 'area',
            }),
          ];
        },
      },
    ],
  };
}
