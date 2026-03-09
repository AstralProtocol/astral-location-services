/**
 * Generate real stamp fixtures from plugin signal shapes.
 *
 * Each generator function builds an unsigned stamp matching what the
 * corresponding plugin's createStampFromSignals() actually produces,
 * signs it with canonicalize() + wallet.signMessage(), and writes JSON.
 *
 * Run: npx tsx packages/astral-service/scripts/generate-stamp-fixtures.ts
 *
 * Adding a new plugin: add one generator function, add it to GENERATORS,
 * run the script. A new JSON file appears in tests/fixtures/stamps/.
 */

import { ethers } from 'ethers';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'tests', 'fixtures', 'stamps');

// Hardhat account #0 — deterministic test wallet
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new ethers.Wallet(TEST_KEY);

/** Sorted-key JSON canonicalization matching all plugins. */
function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (value as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return value;
  });
}

interface UnsignedStamp {
  lpVersion: string;
  locationType: string;
  location: { type: string; coordinates: [number, number] };
  srs: string;
  temporalFootprint: { start: number; end: number };
  plugin: string;
  pluginVersion: string;
  signals: Record<string, unknown>;
}

async function signStamp(unsigned: UnsignedStamp) {
  const message = canonicalize(unsigned);
  const signature = await wallet.signMessage(message);
  const now = Math.floor(Date.now() / 1000);
  return {
    ...unsigned,
    signatures: [
      {
        signer: { scheme: 'eth-address', value: wallet.address },
        algorithm: 'secp256k1',
        value: signature,
        timestamp: now,
      },
    ],
  };
}

// ============================================
// Generator functions — one per plugin
// ============================================

const now = Math.floor(Date.now() / 1000);

function gpsdUnsigned(): UnsignedStamp {
  return {
    lpVersion: '0.2',
    locationType: 'geojson-point',
    location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
    srs: 'EPSG:4326',
    temporalFootprint: { start: now, end: now + 60 },
    plugin: 'gpsd',
    pluginVersion: '0.1.0',
    signals: {
      source: 'gpsd',
      accuracyMeters: 5,
      mode: 3,
    },
  };
}

function geoclueUnsigned(): UnsignedStamp {
  return {
    lpVersion: '0.2',
    locationType: 'geojson-point',
    location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
    srs: 'EPSG:4326',
    temporalFootprint: { start: now, end: now + 60 },
    plugin: 'geoclue',
    pluginVersion: '0.1.0',
    signals: {
      source: 'geoclue2',
      accuracyMeters: 50,
      platform: 'linux',
    },
  };
}

function wifiMlsUnsigned(): UnsignedStamp {
  return {
    lpVersion: '0.2',
    locationType: 'geojson-point',
    location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
    srs: 'EPSG:4326',
    temporalFootprint: { start: now, end: now + 60 },
    plugin: 'wifi-mls',
    pluginVersion: '0.1.0',
    signals: {
      source: 'wifi',
      accuracyMeters: 100,
      apCount: 5,
    },
  };
}

function ipGeolocationUnsigned(): UnsignedStamp {
  return {
    lpVersion: '0.2',
    locationType: 'geojson-point',
    location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
    srs: 'EPSG:4326',
    temporalFootprint: { start: now, end: now + 60 },
    plugin: 'ip-geolocation',
    pluginVersion: '0.1.0',
    signals: {
      source: 'ip-geolocation',
      accuracyMeters: 25000,
      ip: '1.2.3.4',
      city: 'New York',
    },
  };
}

// ============================================
// Registry — add new plugins here
// ============================================

const GENERATORS: Record<string, () => UnsignedStamp> = {
  gpsd: gpsdUnsigned,
  geoclue: geoclueUnsigned,
  'wifi-mls': wifiMlsUnsigned,
  'ip-geolocation': ipGeolocationUnsigned,
};

// ============================================
// Main
// ============================================

async function main() {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const [name, generator] of Object.entries(GENERATORS)) {
    const unsigned = generator();
    const signed = await signStamp(unsigned);
    const path = join(FIXTURES_DIR, `${name}.json`);
    writeFileSync(path, JSON.stringify(signed, null, 2) + '\n');
    console.log(`wrote ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
