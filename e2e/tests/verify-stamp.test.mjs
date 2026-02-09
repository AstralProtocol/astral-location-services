/**
 * Verify stamp tests.
 */
import {
  VALID_STAMP, STAMP_INVALID_SIGNATURE,
} from '../lib/fixtures.mjs';
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
        name: 'stamp-invalid-signature',
        fn: async () => {
          const res = await client.verify.stamp(STAMP_INVALID_SIGNATURE);
          // API may return 200 with valid=false, or 400 for malformed stamps.
          // Either is acceptable — we just verify it doesn't return valid=true.
          const notValid = res.status === 400 || res.body?.valid === false;
          return [
            {
              pass: notValid,
              message: notValid
                ? `Invalid stamp correctly rejected (HTTP ${res.status})`
                : `Invalid stamp unexpectedly accepted as valid`,
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
