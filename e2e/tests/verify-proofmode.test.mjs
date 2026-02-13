/**
 * ProofMode E2E: ZIP → parse → stamp → verify → proof → attestation
 *
 * Walks a real ProofMode iOS ZIP bundle through every layer:
 *   plugin parser → stamp creator → stamp verifier →
 *   proof evaluator → attestation signer
 *
 * Tests are skipped if the private ZIP fixture is missing.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ethers } from 'ethers';
import { ProofModePlugin } from '../../../plugin-proofmode/dist/index.mjs';
import { BOOLEAN_SCHEMA_UID } from '../lib/fixtures.mjs';
import { assertStatus, assertTrue, assertEqual } from '../lib/assertions.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ZIP_PATH = join(__dirname, '..', 'fixtures', 'private-proofmode-ios.zip');
const WGS84_SRS = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';

const hasZip = existsSync(ZIP_PATH);

function skip(reason) {
  return { pass: true, message: `SKIPPED: ${reason}` };
}

export function suite(client) {
  // Shared state — each step builds on the previous
  const plugin = new ProofModePlugin();
  let bundle = null;
  let stamp = null;
  let proof = null;
  let verifyStampRes = null;
  let verifyProofRes = null;

  const verifySchema = BOOLEAN_SCHEMA_UID;

  return {
    name: 'verify-proofmode',
    tests: [
      // ── Step 1: PARSE — Load and parse the real ZIP ──────────────
      {
        name: 'proofmode-parse-bundle',
        fn: async () => {
          if (!hasZip) return [skip('private ProofMode ZIP not available')];

          const zipData = new Uint8Array(readFileSync(ZIP_PATH));
          bundle = plugin.parseBundle(zipData);

          const lat = bundle.metadata.signals['Location.Latitude'];

          return [
            assertEqual(bundle.metadata.format, 'csv', 'metadata format'),
            {
              pass: bundle.files.length >= 5,
              message: `bundle has ${bundle.files.length} files (expected >= 5)`,
            },
            assertTrue(
              bundle.publicKey?.includes('BEGIN PGP PUBLIC KEY BLOCK'),
              'publicKey contains PGP header',
            ),
            assertTrue(
              bundle.metadataSignature && bundle.metadataSignature.length > 0,
              'metadataSignature non-empty',
            ),
            assertTrue(bundle.deviceCheckAttestation, 'deviceCheckAttestation present'),
            assertTrue(bundle.otsProof, 'otsProof present'),
            assertTrue(bundle.mediaFileName?.endsWith('.jpg'), 'media is .jpg'),
            {
              pass: typeof lat === 'number' && lat >= -90 && lat <= 90,
              message: `latitude ${lat} is valid (expected number in [-90, 90])`,
            },
          ];
        },
      },

      // ── Step 2: CREATE — Build a LocationStamp ───────────────────
      {
        name: 'proofmode-create-stamp',
        fn: async () => {
          if (!bundle) return [skip('parse step did not complete')];

          stamp = plugin.createStampFromBundle(bundle);

          return [
            assertEqual(stamp.plugin, 'proofmode', 'plugin name'),
            assertEqual(stamp.lpVersion, '0.2', 'LP version'),
            assertEqual(stamp.location?.type, 'Point', 'location type'),
            {
              pass: Array.isArray(stamp.location?.coordinates) &&
                stamp.location.coordinates.length === 2,
              message: `coordinates has ${stamp.location?.coordinates?.length} elements (expected 2)`,
            },
            {
              pass: stamp.temporalFootprint?.start > 0,
              message: `temporalFootprint.start = ${stamp.temporalFootprint?.start} (expected > 0)`,
            },
            assertTrue(stamp.signals?.['DeviceCheck.Attestation'], 'DeviceCheck in signals'),
            assertEqual(stamp.signals?.['HasOTS'], true, 'HasOTS'),
            assertEqual(stamp.signals?.['HasPGPKey'], true, 'HasPGPKey'),
            assertTrue(
              typeof stamp.signals?.['PGP.PublicKey'] === 'string' &&
                stamp.signals['PGP.PublicKey'].includes('BEGIN PGP PUBLIC KEY BLOCK'),
              'PGP.PublicKey in signals',
            ),
            assertTrue(
              typeof stamp.signals?.['PGP.MetadataSignature'] === 'string' &&
                stamp.signals['PGP.MetadataSignature'].length > 0,
              'PGP.MetadataSignature in signals',
            ),
          ];
        },
      },

      // ── Step 3: SIGN — Ethereum-sign the stamp via plugin ──────
      {
        name: 'proofmode-sign-stamp',
        fn: async () => {
          if (!stamp) return [skip('create step did not complete')];

          const wallet = ethers.Wallet.createRandom();
          const signer = {
            algorithm: 'secp256k1',
            signer: { scheme: 'eth-address', value: wallet.address },
            sign: (data) => wallet.signMessage(data),
          };

          stamp = await plugin.sign(stamp, signer);
          const sig = stamp.signatures[0];

          return [
            assertTrue(sig.value.startsWith('0x'), 'signature is hex'),
            {
              pass: sig.value.length === 132,
              message: `signature length: ${sig.value.length} (expected 132)`,
            },
            assertTrue(sig.signer.value.startsWith('0x'), 'signer is eth address'),
            assertEqual(sig.signer.scheme, 'eth-address', 'signer scheme'),
            assertEqual(sig.algorithm, 'secp256k1', 'algorithm'),
          ];
        },
      },

      // ── Step 4: VERIFY STAMP — POST /verify/v0/stamp ────────────
      {
        name: 'proofmode-verify-stamp',
        fn: async () => {
          if (!stamp?.signatures) return [skip('sign step did not complete')];

          verifyStampRes = await client.verify.stamp(stamp);
          const b = verifyStampRes.body;

          return [
            assertStatus(verifyStampRes, 200),
            assertEqual(b?.valid, true, 'stamp valid'),
            assertEqual(b?.structureValid, true, 'structure valid'),
            assertEqual(b?.signaturesValid, true, 'signatures valid'),
            assertEqual(b?.signalsConsistent, true, 'signals consistent'),
          ];
        },
      },

      // ── Step 5 + 6: BUILD PROOF & VERIFY — Full credibility ─────
      {
        name: 'proofmode-verify-proof',
        fn: async () => {
          if (!stamp?.signatures) return [skip('sign step did not complete')];

          const [lon, lat] = stamp.location.coordinates;

          const claim = {
            lpVersion: '0.2',
            locationType: 'geojson-point',
            location: { type: 'Point', coordinates: [lon, lat] },
            srs: WGS84_SRS,
            subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
            radius: 100,
            time: {
              start: stamp.temporalFootprint.start - 60,
              end: stamp.temporalFootprint.end + 60,
            },
            eventType: 'presence',
          };

          proof = { claim, stamps: [stamp] };
          verifyProofRes = await client.verify.proof(proof, { schema: verifySchema });
          const b = verifyProofRes.body;
          const spatial = b?.credibility?.dimensions?.spatial;
          const temporal = b?.credibility?.dimensions?.temporal;
          const validity = b?.credibility?.dimensions?.validity;
          const independence = b?.credibility?.dimensions?.independence;
          const stampResult = b?.credibility?.stampResults?.[0];
          const meta = b?.credibility?.meta;

          return [
            assertStatus(verifyProofRes, 200),
            assertEqual(spatial?.withinRadiusFraction, 1, 'withinRadiusFraction'),
            assertEqual(spatial?.meanDistanceMeters, 0, 'meanDistanceMeters'),
            {
              pass: temporal?.meanOverlap > 0,
              message: `temporal.meanOverlap = ${temporal?.meanOverlap} (expected > 0)`,
            },
            assertEqual(validity?.structureValidFraction, 1, 'structureValidFraction'),
            assertEqual(validity?.signaturesValidFraction, 1, 'signaturesValidFraction'),
            assertEqual(validity?.signalsConsistentFraction, 1, 'signalsConsistentFraction'),
            assertTrue(
              independence?.pluginNames?.includes('proofmode'),
              'independence includes proofmode',
            ),
            assertEqual(stampResult?.plugin, 'proofmode', 'stampResult plugin'),
            assertEqual(stampResult?.withinRadius, true, 'stampResult withinRadius'),
            assertEqual(meta?.stampCount, 1, 'stampCount'),
            assertEqual(meta?.evaluationMode, 'tee', 'evaluationMode'),
          ];
        },
      },

      // ── Step 7: ATTESTATION — Verify EAS attestation structure ──
      {
        name: 'proofmode-attestation',
        fn: async () => {
          if (!verifyProofRes?.body) return [skip('proof verification did not complete')];

          const b = verifyProofRes.body;
          const att = b.attestation;
          const del = b.delegatedAttestation;

          return [
            assertTrue(att, 'attestation present'),
            {
              pass: att?.schema?.startsWith('0x') && att?.schema?.length === 66,
              message: `attestation.schema format: ${att?.schema?.slice(0, 10)}... (expected 0x + 64 hex)`,
            },
            {
              pass: att?.attester?.startsWith('0x') && att?.attester?.length === 42,
              message: `attestation.attester: ${att?.attester} (expected 0x + 40 hex)`,
            },
            assertTrue(att?.data?.startsWith('0x') && att?.data?.length > 2, 'attestation.data non-empty hex'),
            {
              pass: att?.signature?.startsWith('0x') && att?.signature?.length >= 132,
              message: `attestation.signature length: ${att?.signature?.length} (expected >= 132)`,
            },
            assertTrue(del, 'delegatedAttestation present'),
            assertEqual(del?.attester, att?.attester, 'delegated attester matches'),
            {
              pass: del?.deadline > Math.floor(Date.now() / 1000),
              message: `deadline ${del?.deadline} is in the future`,
            },
          ];
        },
      },

      // ── Step 8: COMPUTE — Feed verified proof into distance ─────
      {
        name: 'proofmode-compute-distance',
        fn: async () => {
          if (!verifyProofRes?.body) return [skip('proof verification did not complete')];

          const verifiedProof = verifyProofRes.body;
          const [lon, lat] = stamp.location.coordinates;
          const claimPoint = { type: 'Point', coordinates: [lon, lat] };

          const res = await client.compute.distance(
            { verifiedProof },
            claimPoint,
          );

          return [
            assertStatus(res, 200),
            {
              pass: typeof res.body?.result === 'number' && res.body.result < 1,
              message: `distance ${res.body?.result}m (expected ~0, same location)`,
            },
            assertTrue(
              Array.isArray(res.body?.proofInputs) && res.body.proofInputs.length === 1,
              'proofInputs has 1 entry',
            ),
            assertTrue(
              res.body?.proofInputs?.[0]?.credibility !== undefined,
              'proofInputs carries credibility',
            ),
            {
              pass: res.body?.proofInputs?.[0]?.ref === verifiedProof.attestation.uid,
              message: 'inputRef matches verify attestation UID',
            },
          ];
        },
      },

      // ── Step 9: NEGATIVE — Antipodal stamp ──────────────────────
      {
        name: 'proofmode-antipodal-claim',
        fn: async () => {
          if (!stamp?.signatures) return [skip('sign step did not complete')];

          const [lon, lat] = stamp.location.coordinates;

          const antipodalClaim = {
            lpVersion: '0.2',
            locationType: 'geojson-point',
            location: { type: 'Point', coordinates: [-lon, -lat] },
            srs: WGS84_SRS,
            subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
            radius: 100,
            time: {
              start: stamp.temporalFootprint.start - 60,
              end: stamp.temporalFootprint.end + 60,
            },
            eventType: 'presence',
          };

          const antipodalProof = { claim: antipodalClaim, stamps: [stamp] };
          const res = await client.verify.proof(antipodalProof, { schema: verifySchema });
          const spatial = res.body?.credibility?.dimensions?.spatial;
          const stampResult = res.body?.credibility?.stampResults?.[0];

          return [
            assertStatus(res, 200),
            assertEqual(spatial?.withinRadiusFraction, 0, 'withinRadiusFraction'),
            {
              pass: spatial?.meanDistanceMeters > 10_000_000,
              message: `meanDistanceMeters = ${spatial?.meanDistanceMeters} (expected > 10M)`,
            },
            assertEqual(stampResult?.withinRadius, false, 'stampResult withinRadius'),
            assertTrue(res.body?.attestation, 'still produces attestation'),
          ];
        },
      },
    ],
  };
}
