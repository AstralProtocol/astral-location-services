/**
 * Verify stamp tests.
 */
import { VALID_STAMP } from '../lib/fixtures.mjs';
import { assertStatus, assertTrue, assertEqual } from '../lib/assertions.mjs';

export function suite(client) {
  return {
    name: 'verify-stamp',
    tests: [
      {
        name: 'stamp-valid',
        fn: async () => {
          const res = await client.verify.stamp(VALID_STAMP);
          return [
            assertStatus(res, 200),
            assertTrue(res.body.valid !== undefined, 'has valid field'),
            assertEqual(res.body.valid, true, 'stamp valid'),
          ];
        },
      },
      {
        name: 'stamp-empty-signature',
        fn: async () => {
          const emptySignatureStamp = {
            ...VALID_STAMP,
            signatures: [
              {
                ...VALID_STAMP.signatures[0],
                value: '',
              },
            ],
          };
          const res = await client.verify.stamp(emptySignatureStamp);
          // Empty signature value should be rejected (400 validation or valid=false)
          const notValid = res.status === 400 || res.body?.valid === false;
          return [
            {
              pass: notValid,
              message: notValid
                ? `Empty signature correctly rejected (HTTP ${res.status})`
                : `Empty signature unexpectedly accepted as valid`,
              details: { status: res.status, body: res.body },
            },
          ];
        },
      },
      {
        name: 'stamp-response-structure',
        fn: async () => {
          const res = await client.verify.stamp(VALID_STAMP);
          return [
            assertStatus(res, 200),
            assertTrue(res.body !== null, 'body is not null'),
            assertTrue('valid' in res.body, 'has valid field'),
          ];
        },
      },
    ],
  };
}
