/**
 * Intersects computation tests.
 */
import {
  GOLDEN_GATE_PARK, OVERLAPPING_POLYGON, DISJOINT_POLYGON,
} from '../lib/fixtures.mjs';
import {
  assertBooleanResult, assertAttestationStructure, assertStatus,
} from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'compute-intersects',
    tests: [
      {
        name: 'intersects-overlapping',
        fn: async () => {
          const res = await client.compute.intersects(GOLDEN_GATE_PARK, OVERLAPPING_POLYGON);
          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: true, operation: 'intersects' }),
            assertAttestationStructure(res.body),
          ];
        },
      },
      {
        name: 'intersects-disjoint',
        fn: async () => {
          const res = await client.compute.intersects(GOLDEN_GATE_PARK, DISJOINT_POLYGON);
          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: false, operation: 'intersects' }),
          ];
        },
      },
    ],
  };
}
