/**
 * Cross-repo integration test: verify real stamps through the service.
 *
 * Globs tests/fixtures/stamps/*.json, loads each file, and feeds the
 * stamp through verifyStamp(). No hardcoded plugin list — adding a
 * new fixture file automatically adds a test case.
 *
 * Also tests a combined proof with all discovered stamps.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStamp, verifyProof } from '../../../src/verify/verifier.js';
import { initPluginRegistry } from '../../../src/verify/plugins/index.js';
import type { LocationStamp, LocationProof, LocationClaim } from '../../../src/types/verify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', 'fixtures', 'stamps');

function loadStampFixtures(): { name: string; stamp: LocationStamp }[] {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  return files.map((f) => ({
    name: basename(f, '.json'),
    stamp: JSON.parse(readFileSync(join(fixturesDir, f), 'utf-8')) as LocationStamp,
  }));
}

const fixtures = loadStampFixtures();

describe('real stamp fixtures', () => {
  beforeAll(() => {
    initPluginRegistry();
  });

  describe('individual stamp verification', () => {
    for (const { name, stamp } of fixtures) {
      it(`verifies ${name} stamp`, async () => {
        const result = await verifyStamp(stamp);

        expect(result.valid).toBe(true);
        expect(result.structureValid).toBe(true);
        expect(result.signaturesValid).toBe(true);
        expect(result.signalsConsistent).toBe(true);
      });
    }
  });

  describe('combined proof verification', () => {
    it('verifies a proof containing all fixture stamps', async () => {
      if (fixtures.length === 0) return;

      const stamp0 = fixtures[0].stamp;
      const coords = (stamp0.location as { coordinates: [number, number] }).coordinates;
      const now = Math.floor(Date.now() / 1000);

      const claim: LocationClaim = {
        lpVersion: '0.2',
        locationType: 'geojson-point',
        location: { type: 'Point', coordinates: coords },
        srs: 'EPSG:4326',
        subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
        radius: 50000, // 50km — generous to accommodate IP geolocation
        time: { start: now - 3600, end: now + 3600 },
        eventType: 'presence',
      };

      const proof: LocationProof = {
        claim,
        stamps: fixtures.map((f) => f.stamp),
      };

      const result = await verifyProof(proof);

      expect(result.stampResults).toHaveLength(fixtures.length);
      for (const sr of result.stampResults) {
        expect(sr.signaturesValid).toBe(true);
        expect(sr.structureValid).toBe(true);
        expect(sr.signalsConsistent).toBe(true);
      }
    });
  });
});
