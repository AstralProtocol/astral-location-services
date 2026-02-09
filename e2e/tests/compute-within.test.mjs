/**
 * Within computation tests.
 */
import { SF_POINT, GOLDEN_GATE_PARK } from '../lib/fixtures.mjs';
import {
  assertBooleanResult, assertAttestationStructure, assertStatus, assertTrue,
} from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'compute-within',
    tests: [
      {
        name: 'within-sf-near-park-5km',
        fn: async () => {
          const res = await client.compute.within(SF_POINT, GOLDEN_GATE_PARK, 5000);
          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: true }),
            // operation may include radius like "within:5000"
            assertTrue(
              res.body.operation && res.body.operation.startsWith('within'),
              `operation starts with "within": "${res.body.operation}"`,
            ),
            assertAttestationStructure(res.body),
          ];
        },
      },
      {
        name: 'within-sf-near-park-1m',
        fn: async () => {
          const res = await client.compute.within(SF_POINT, GOLDEN_GATE_PARK, 1);
          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: false }),
          ];
        },
      },
    ],
  };
}
