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
          return [
            assertStatus(res, 200),
            assertTrue(res.body !== null, 'body is not null'),
            {
              pass: typeof res.body.credibility?.confidence === 'number' && res.body.credibility.confidence > 0,
              message: `credibility.confidence: ${res.body.credibility?.confidence}`,
              details: res.body,
            },
          ];
        },
      },
      {
        name: 'proof-multi-stamp',
        fn: async () => {
          const res = await client.verify.proof(MULTI_STAMP_PROOF, { schema: verifySchema });
          return [
            assertStatus(res, 200),
            assertTrue(res.body !== null, 'body is not null'),
            {
              pass: res.body.credibility?.correlation !== undefined,
              message: `correlation defined: ${JSON.stringify(res.body.credibility?.correlation)}`,
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
          ];
        },
      },
    ],
  };
}
