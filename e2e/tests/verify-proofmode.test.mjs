/**
 * ProofMode-specific verify tests.
 *
 * Uses real stamp data parsed from a private ProofMode bundle.
 * Tests are skipped if the private fixture file is not present.
 */

import { BOOLEAN_SCHEMA_UID } from '../lib/fixtures.mjs';
import { assertStatus, assertTrue, assertEqual } from '../lib/assertions.mjs';
import { loadProofModeFixtures, hasProofModeFixtures } from '../lib/proofmode-fixtures.mjs';

function skipTest(reason) {
  return {
    pass: true,
    message: `SKIPPED: ${reason}`,
  };
}

export function suite(client) {
  const fixtures = hasProofModeFixtures ? loadProofModeFixtures() : null;
  const verifySchema = BOOLEAN_SCHEMA_UID;

  return {
    name: 'verify-proofmode',
    tests: [
      {
        name: 'proofmode-stamp-valid',
        fn: async () => {
          if (!fixtures) return [skipTest('private ProofMode fixture not available')];

          const res = await client.verify.stamp(fixtures.stamp);
          return [
            assertStatus(res, 200),
            assertEqual(res.body.valid, true, 'stamp valid'),
            assertTrue(res.body.structureValid === true, 'structure valid'),
            assertTrue(res.body.signalsConsistent === true, 'signals consistent'),
          ];
        },
      },
      {
        name: 'proofmode-proof-single-stamp',
        fn: async () => {
          if (!fixtures) return [skipTest('private ProofMode fixture not available')];

          const res = await client.verify.proof(fixtures.proof, { schema: verifySchema });
          const spatial = res.body?.credibility?.dimensions?.spatial;
          const validity = res.body?.credibility?.dimensions?.validity;
          return [
            assertStatus(res, 200),
            {
              pass: spatial?.withinRadiusFraction === 1,
              message: `withinRadiusFraction: ${spatial?.withinRadiusFraction} (expected 1)`,
            },
            {
              pass: validity?.structureValidFraction === 1,
              message: `structureValidFraction: ${validity?.structureValidFraction} (expected 1)`,
            },
            {
              pass: validity?.signalsConsistentFraction === 1,
              message: `signalsConsistentFraction: ${validity?.signalsConsistentFraction} (expected 1)`,
            },
          ];
        },
      },
      {
        name: 'proofmode-response-shape',
        fn: async () => {
          if (!fixtures) return [skipTest('private ProofMode fixture not available')];

          const res = await client.verify.proof(fixtures.proof, { schema: verifySchema });
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
      {
        name: 'proofmode-stamp-outside-radius',
        fn: async () => {
          if (!fixtures) return [skipTest('private ProofMode fixture not available')];

          const res = await client.verify.proof(fixtures.proofOutsideRadius, { schema: verifySchema });
          const spatial = res.body?.credibility?.dimensions?.spatial;
          return [
            assertStatus(res, 200),
            {
              pass: spatial?.withinRadiusFraction === 0,
              message: `withinRadiusFraction: ${spatial?.withinRadiusFraction} (expected 0)`,
            },
          ];
        },
      },
      {
        name: 'proofmode-unknown-plugin',
        fn: async () => {
          if (!fixtures) return [skipTest('private ProofMode fixture not available')];

          const res = await client.verify.stamp(fixtures.stampUnknownPlugin);
          // Service returns 500 when plugin is not registered
          const rejected = res.status === 500 || res.body?.valid === false;
          return [
            {
              pass: rejected,
              message: rejected
                ? `Unknown plugin correctly rejected (HTTP ${res.status})`
                : `Unknown plugin unexpectedly accepted`,
              details: { status: res.status, body: res.body },
            },
          ];
        },
      },
    ],
  };
}
