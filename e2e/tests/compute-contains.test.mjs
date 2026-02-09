/**
 * Contains computation tests.
 */
import {
  GOLDEN_GATE_PARK, POINT_IN_PARK, POINT_NEAR_PARK,
  POINT_ON_BOUNDARY, INVALID_COORDINATES_OUT_OF_RANGE,
} from '../lib/fixtures.mjs';
import {
  assertBooleanResult, assertAttestationStructure, assertStatus,
} from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'compute-contains',
    tests: [
      {
        name: 'contains-point-in-park',
        fn: async () => {
          const res = await client.compute.contains(GOLDEN_GATE_PARK, POINT_IN_PARK);
          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: true, operation: 'contains' }),
            assertAttestationStructure(res.body),
          ];
        },
      },
      {
        name: 'contains-point-outside',
        fn: async () => {
          const res = await client.compute.contains(GOLDEN_GATE_PARK, POINT_NEAR_PARK);
          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: false, operation: 'contains' }),
          ];
        },
      },
      {
        name: 'contains-boundary-point',
        fn: async () => {
          // Boundary point should not error, result can be true or false
          const res = await client.compute.contains(GOLDEN_GATE_PARK, POINT_ON_BOUNDARY);
          return [
            assertStatus(res, 200),
            {
              pass: typeof res.body.result === 'boolean',
              message: `Boundary point returned boolean: ${res.body.result}`,
              details: { result: res.body.result },
            },
          ];
        },
      },
      {
        name: 'contains-invalid-input-400',
        fn: async () => {
          const res = await client.compute.contains(
            GOLDEN_GATE_PARK,
            INVALID_COORDINATES_OUT_OF_RANGE
          );
          return [
            assertStatus(res, 400),
          ];
        },
      },
    ],
  };
}
