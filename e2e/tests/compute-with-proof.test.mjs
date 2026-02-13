/**
 * E2E tests for compute operations with verified proof inputs.
 *
 * Pipeline: verify a proof, then feed the VerifiedLocationProofResponse
 * into compute operations as an input.
 */
import {
  VALID_PROOF, SF_POINT, BOOLEAN_SCHEMA_UID,
} from '../lib/fixtures.mjs';
import {
  assertStatus, assertNumericResult, assertBooleanResult, assertTrue,
} from '../lib/assertions.mjs';

export function suite(client) {
  const verifySchema = BOOLEAN_SCHEMA_UID;

  return {
    name: 'compute-with-proof',
    tests: [
      {
        name: 'distance: verified proof vs raw geometry',
        fn: async () => {
          // Step 1: Verify the proof
          const verifyRes = await client.verify.proof(VALID_PROOF, { schema: verifySchema });
          if (!verifyRes.ok) {
            return [{ pass: false, message: `verify failed: ${verifyRes.status}`, details: verifyRes.body }];
          }

          const verifiedProof = verifyRes.body;

          // Step 2: Use verified proof as compute input
          const res = await client.compute.distance(
            { verifiedProof },
            SF_POINT,
          );

          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, { min: 0, max: 100, units: 'meters', operation: 'distance' }),
            assertTrue(
              Array.isArray(res.body.proofInputs) && res.body.proofInputs.length === 1,
              'proofInputs has 1 entry',
            ),
            assertTrue(
              res.body.proofInputs?.[0]?.ref === verifiedProof.attestation.uid,
              'proofInputs ref matches attestation UID',
            ),
          ];
        },
      },
      {
        name: 'distance: two verified proof inputs',
        fn: async () => {
          const verifyRes = await client.verify.proof(VALID_PROOF, { schema: verifySchema });
          if (!verifyRes.ok) {
            return [{ pass: false, message: `verify failed: ${verifyRes.status}`, details: verifyRes.body }];
          }

          const verifiedProof = verifyRes.body;

          const res = await client.compute.distance(
            { verifiedProof },
            { verifiedProof },
          );

          return [
            assertStatus(res, 200),
            assertNumericResult(res.body, { min: 0, max: 1, units: 'meters', operation: 'distance' }),
            assertTrue(
              Array.isArray(res.body.proofInputs) && res.body.proofInputs.length === 2,
              'proofInputs has 2 entries',
            ),
          ];
        },
      },
      {
        name: 'within: verified proof within radius of same point',
        fn: async () => {
          const verifyRes = await client.verify.proof(VALID_PROOF, { schema: verifySchema });
          if (!verifyRes.ok) {
            return [{ pass: false, message: `verify failed: ${verifyRes.status}`, details: verifyRes.body }];
          }

          const verifiedProof = verifyRes.body;

          const res = await client.compute.within(
            { verifiedProof },
            SF_POINT,
            200,
          );

          return [
            assertStatus(res, 200),
            assertBooleanResult(res.body, { expected: true }),
            assertTrue(
              Array.isArray(res.body.proofInputs) && res.body.proofInputs.length === 1,
              'proofInputs has 1 entry',
            ),
          ];
        },
      },
      {
        name: 'proofInputs includes credibility and claim',
        fn: async () => {
          const verifyRes = await client.verify.proof(VALID_PROOF, { schema: verifySchema });
          if (!verifyRes.ok) {
            return [{ pass: false, message: `verify failed: ${verifyRes.status}`, details: verifyRes.body }];
          }

          const verifiedProof = verifyRes.body;

          const res = await client.compute.distance(
            { verifiedProof },
            SF_POINT,
          );

          const ctx = res.body?.proofInputs?.[0];
          return [
            assertStatus(res, 200),
            assertTrue(ctx !== undefined, 'proofInputs[0] exists'),
            assertTrue(ctx?.credibility !== undefined, 'has credibility'),
            assertTrue(ctx?.claim !== undefined, 'has claim'),
            assertTrue(typeof ctx?.evaluatedAt === 'number', 'has evaluatedAt'),
            assertTrue(typeof ctx?.evaluationMethod === 'string', 'has evaluationMethod'),
          ];
        },
      },
      {
        name: 'rejects non-GeoJSON claim location',
        fn: async () => {
          // Forge a verifiedProof with a string location (H3 index)
          const fakeVerifiedProof = {
            proof: {
              claim: {
                lpVersion: '0.2',
                locationType: 'h3-index',
                location: '8928308280fffff',
                srs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
                subject: { scheme: 'eth-address', value: '0x0000000000000000000000000000000000000000' },
                radius: 100,
                time: { start: 0, end: 1 },
              },
              stamps: [],
            },
            credibility: {},
            attestation: { uid: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          };

          const res = await client.compute.distance(
            { verifiedProof: fakeVerifiedProof },
            SF_POINT,
          );

          return [
            assertStatus(res, 400),
            assertTrue(
              res.body?.detail?.includes('non-GeoJSON') || res.body?.title === 'Bad Request',
              'error mentions non-GeoJSON or bad request',
            ),
          ];
        },
      },
      {
        name: 'no proofInputs when using raw geometry',
        fn: async () => {
          const res = await client.compute.distance(SF_POINT, SF_POINT);

          return [
            assertStatus(res, 200),
            assertTrue(
              res.body.proofInputs === undefined,
              'proofInputs absent for raw geometry inputs',
            ),
          ];
        },
      },
    ],
  };
}
