/**
 * Attestation signature verification tests.
 * Verifies EIP-712 signatures from API responses.
 * Uses a shared API call to reduce total request count.
 */
import { SF_POINT, NYC_POINT, TEST_CHAIN_ID } from '../lib/fixtures.mjs';
import { verifySignature, assertValidSignature } from '../lib/signature.mjs';
import { assertStatus, assertTrue } from '../lib/assertions.mjs';

export function suite(client) {
  // Cache the distance response to avoid duplicate requests (rate limit is tight)
  let distanceRes = null;

  async function getDistanceRes() {
    if (!distanceRes) {
      distanceRes = await client.compute.distance(SF_POINT, NYC_POINT);
    }
    return distanceRes;
  }

  return {
    name: 'attestation-signature',
    tests: [
      {
        name: 'signature-verify-recovers-attester',
        fn: async () => {
          const res = await getDistanceRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }
          const sigResult = assertValidSignature(res.body, client.chainId || TEST_CHAIN_ID);

          return [
            assertStatus(res, 200),
            sigResult,
          ];
        },
      },
      {
        name: 'signature-tampered-data-fails',
        fn: async () => {
          const res = await getDistanceRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }

          // Tamper with the data field
          const tampered = {
            ...res.body,
            attestation: {
              ...res.body.attestation,
              data: res.body.attestation.data.slice(0, -4) + 'ffff',
            },
          };

          try {
            const recovered = verifySignature(tampered, client.chainId || TEST_CHAIN_ID);
            const expected = res.body.delegatedAttestation.attester;
            const mismatch = recovered.toLowerCase() !== expected.toLowerCase();

            return [
              {
                pass: mismatch,
                message: mismatch
                  ? `Tampered data recovers different address: ${recovered}`
                  : `Tampered data still recovers attester (unexpected)`,
                details: { recovered, expected },
              },
            ];
          } catch (err) {
            // If verification throws, that's also acceptable
            return [
              {
                pass: true,
                message: `Tampered data verification failed as expected: ${err.message}`,
                details: { error: err.message },
              },
            ];
          }
        },
      },
      {
        name: 'signature-format-65-bytes-hex',
        fn: async () => {
          const res = await getDistanceRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }
          const sig = res.body.attestation.signature;

          // 0x + 130 hex chars = 65 bytes
          const isHex = sig.startsWith('0x');
          const correctLength = sig.length === 132; // 0x + 130

          return [
            assertStatus(res, 200),
            assertTrue(isHex, 'signature starts with 0x'),
            assertTrue(correctLength, `signature length is ${sig.length} (expected 132)`),
          ];
        },
      },
    ],
  };
}
