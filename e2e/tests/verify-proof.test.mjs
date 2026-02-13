/**
 * Verify proof tests.
 */
import {
  VALID_PROOF, MULTI_STAMP_PROOF, BOOLEAN_SCHEMA_UID,
} from '../lib/fixtures.mjs';
import { assertStatus, assertTrue } from '../lib/assertions.mjs';

export function suite(client) {
  // Use a schema UID for verify proof requests (staging may not have VERIFY_SCHEMA_UID env var)
  // We reuse the boolean schema UID — the verify endpoint just needs *a* registered schema
  const verifySchema = BOOLEAN_SCHEMA_UID;

  return {
    name: 'verify-proof',
    tests: [
      {
        name: 'proof-single-stamp',
        fn: async () => {
          const res = await client.verify.proof(VALID_PROOF, { schema: verifySchema });
          const validity = res.body?.credibility?.dimensions?.validity;
          return [
            assertStatus(res, 200),
            assertTrue(res.body !== null, 'body is not null'),
            {
              pass: validity?.structureValidFraction === 1,
              message: `structureValidFraction: ${validity?.structureValidFraction} (expected 1)`,
              details: res.body,
            },
          ];
        },
      },
      {
        name: 'proof-multi-stamp',
        fn: async () => {
          const res = await client.verify.proof(MULTI_STAMP_PROOF, { schema: verifySchema });
          const independence = res.body?.credibility?.dimensions?.independence;
          return [
            assertStatus(res, 200),
            assertTrue(res.body !== null, 'body is not null'),
            {
              pass: independence?.uniquePluginRatio !== undefined,
              message: `independence.uniquePluginRatio: ${independence?.uniquePluginRatio}`,
              details: res.body,
            },
          ];
        },
      },
      {
        name: 'proof-response-structure',
        fn: async () => {
          const res = await client.verify.proof(VALID_PROOF, { schema: verifySchema });
          return [
            assertStatus(res, 200),
            assertTrue('credibility' in res.body, 'has credibility'),
            assertTrue('attestation' in res.body, 'has attestation'),
            assertTrue('delegatedAttestation' in res.body, 'has delegatedAttestation'),
            assertTrue('evaluationMethod' in res.body, 'has evaluationMethod'),
            assertTrue('evaluatedAt' in res.body, 'has evaluatedAt'),
          ];
        },
      },
    ],
  };
}
