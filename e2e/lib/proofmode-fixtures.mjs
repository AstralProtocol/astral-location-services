/**
 * ProofMode E2E test fixtures.
 *
 * Loads a real ProofMode stamp (parsed from a private bundle by plugin-proofmode)
 * and builds claim/proof objects for E2E testing.
 *
 * The stamp JSON is gitignored because it contains real location data.
 * To run these tests, parse a ProofMode bundle and save the stamp JSON to:
 *   e2e/fixtures/private-proofmode-stamp.json
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STAMP_PATH = join(__dirname, '..', 'fixtures', 'private-proofmode-stamp.json');
const WGS84_SRS = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';

export const hasProofModeFixtures = existsSync(STAMP_PATH);

/**
 * Load the real ProofMode stamp and derive test fixtures from it.
 * Returns null if the stamp file doesn't exist.
 */
export function loadProofModeFixtures() {
  if (!hasProofModeFixtures) return null;

  const raw = readFileSync(STAMP_PATH, 'utf-8');
  const unsignedStamp = JSON.parse(raw);

  // Add a test signature — ProofMode stamps are unsigned (the plugin is a parser,
  // not a signer). The protocol requires at least one signature on a stamp.
  const now = Math.floor(Date.now() / 1000);
  const stamp = {
    ...unsignedStamp,
    signatures: [
      {
        signer: { scheme: 'pgp', value: 'proofmode-test-key' },
        algorithm: 'PGP',
        value: unsignedStamp.signals?.FileHash || 'proofmode-test-signature',
        timestamp: now,
      },
    ],
  };

  // Build a claim that matches the stamp's location (within 100m radius)
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

  const proof = {
    claim,
    stamps: [stamp],
  };

  // Stamp with location far from the claim (antipodal point)
  const stampOutsideRadius = {
    ...stamp,
    location: { type: 'Point', coordinates: [-lon, -lat] },
  };

  const proofOutsideRadius = {
    claim,
    stamps: [stampOutsideRadius],
  };

  // Stamp with unknown plugin name
  const stampUnknownPlugin = {
    ...stamp,
    plugin: 'nonexistent-plugin',
  };

  return {
    stamp,
    claim,
    proof,
    stampOutsideRadius,
    proofOutsideRadius,
    stampUnknownPlugin,
  };
}
