/**
 * Length computation tests.
 */
import { SIMPLE_LINE } from '../lib/fixtures.mjs';
import {
  assertNumericResult, assertAttestationStructure, assertStatus,
} from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'compute-length',
    tests: [
      {
        name: 'length-simple-line',
        fn: async () => {
          const res = await client.compute.length(SIMPLE_LINE);
          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, {
              min: 100,
              max: 5000,
              units: 'meters',
              operation: 'length',
            }),
            assertAttestationStructure(res.body),
          ];
        },
      },
    ],
  };
}
