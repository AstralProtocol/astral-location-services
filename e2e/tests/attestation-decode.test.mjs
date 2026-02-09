/**
 * Attestation decoding tests.
 * Verifies that encoded attestation data can be decoded and round-trips correctly.
 * Uses a shared API call to reduce total request count.
 */
import { SF_POINT, NYC_POINT, GOLDEN_GATE_PARK, POINT_IN_PARK } from '../lib/fixtures.mjs';
import { decodeNumericAttestation, decodeBooleanAttestation, SCALE_FACTORS } from '../lib/eas-schemas.mjs';
import { assertStatus, assertTrue, assertEqual } from '../lib/assertions.mjs';

export function suite(client) {
  // Cache API responses to avoid duplicate requests (rate limit is tight)
  let distanceRes = null;
  let containsRes = null;

  async function getDistanceRes() {
    if (!distanceRes) {
      distanceRes = await client.compute.distance(SF_POINT, NYC_POINT);
    }
    return distanceRes;
  }

  async function getContainsRes() {
    if (!containsRes) {
      containsRes = await client.compute.contains(GOLDEN_GATE_PARK, POINT_IN_PARK);
    }
    return containsRes;
  }

  return {
    name: 'attestation-decode',
    tests: [
      {
        name: 'decode-distance-roundtrip',
        fn: async () => {
          const res = await getDistanceRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }
          const decoded = decodeNumericAttestation(res.body.attestation.data);

          // result in attestation is scaled to centimeters
          const expectedCm = BigInt(Math.round(res.body.result * Number(SCALE_FACTORS.DISTANCE)));

          return [
            assertStatus(res, 200),
            assertEqual(decoded.operation, 'distance', 'operation'),
            assertTrue(decoded.units === 'centimeters' || decoded.units === 'meters', 'units'),
            {
              pass: decoded.result === expectedCm,
              message: decoded.result === expectedCm
                ? `Decoded result ${decoded.result} matches expected ${expectedCm}`
                : `Decoded result ${decoded.result} !== expected ${expectedCm}`,
              details: { decoded: decoded.result.toString(), expected: expectedCm.toString() },
            },
          ];
        },
      },
      {
        name: 'decode-boolean-contains',
        fn: async () => {
          const res = await getContainsRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }
          const decoded = decodeBooleanAttestation(res.body.attestation.data);

          return [
            assertStatus(res, 200),
            assertEqual(decoded.operation, 'contains', 'operation'),
            assertEqual(decoded.result, true, 'decoded result'),
          ];
        },
      },
      {
        name: 'decode-numeric-has-inputRefs',
        fn: async () => {
          const res = await getDistanceRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }
          const decoded = decodeNumericAttestation(res.body.attestation.data);

          return [
            assertStatus(res, 200),
            assertTrue(Array.isArray(decoded.inputRefs), 'inputRefs is array'),
            assertTrue(decoded.inputRefs.length > 0, 'inputRefs non-empty'),
          ];
        },
      },
      {
        name: 'decode-has-timestamp',
        fn: async () => {
          const res = await getDistanceRes();
          if (res.status !== 200) {
            return [assertStatus(res, 200)];
          }
          const decoded = decodeNumericAttestation(res.body.attestation.data);

          return [
            assertStatus(res, 200),
            assertTrue(decoded.timestamp > 0n, 'timestamp > 0'),
          ];
        },
      },
    ],
  };
}
