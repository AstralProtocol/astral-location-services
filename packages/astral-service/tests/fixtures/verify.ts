/**
 * Test fixtures for verify module.
 */

import { ethers } from 'ethers';
import type { LocationClaim, LocationStamp, LocationProof } from '../../src/types/verify.js';
import { TEST_SCHEMA_UID, TEST_RECIPIENT, TEST_CHAIN_ID } from './geometries.js';
import { canonicalize } from '../../src/verify/plugins/geo-utils.js';

// SRS value matching real plugin output
const SRS = 'EPSG:4326';

// Current timestamp for testing
const now = Math.floor(Date.now() / 1000);

// Hardhat account #0 — deterministic test wallet
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const testWallet = new ethers.Wallet(TEST_PRIVATE_KEY);

/**
 * Sign a stamp with the test wallet.
 * Uses canonicalize() for sorted-key JSON, matching real plugin signing.
 */
export function signStamp(stamp: Omit<LocationStamp, 'signatures'>, timestamp: number): LocationStamp {
  const message = canonicalize(stamp);
  const signature = testWallet.signMessageSync(message);
  return {
    ...stamp,
    signatures: [
      {
        signer: { scheme: 'eth-address', value: testWallet.address },
        algorithm: 'secp256k1',
        value: signature,
        timestamp,
      },
    ],
  };
}

/**
 * Sign a stamp with the test wallet but claim a DIFFERENT signer address.
 * For testing ECDSA recovery mismatch detection.
 */
export function signStampWrongSigner(stamp: Omit<LocationStamp, 'signatures'>, timestamp: number): LocationStamp {
  const message = canonicalize(stamp);
  const signature = testWallet.signMessageSync(message);
  return {
    ...stamp,
    signatures: [
      {
        signer: { scheme: 'eth-address', value: '0x0000000000000000000000000000000000000001' },
        algorithm: 'secp256k1',
        value: signature,
        timestamp,
      },
    ],
  };
}

/**
 * Valid LocationClaim for San Francisco
 */
export const VALID_CLAIM: LocationClaim = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  srs: SRS,
  subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
  radius: 100, // 100 meters
  time: { start: now - 60, end: now }, // Last minute
  eventType: 'presence',
};

/**
 * Valid LocationStamp matching the claim
 */
export const VALID_STAMP: LocationStamp = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  srs: SRS,
  temporalFootprint: { start: now - 120, end: now + 60 },
  plugin: 'proofmode',
  pluginVersion: '0.1.0',
  signals: {
    deviceType: 'mobile',
    accuracy: 10,
  },
  signatures: [
    {
      signer: { scheme: 'device-pubkey', value: '0xabcdef1234567890' },
      algorithm: 'secp256k1',
      value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00',
      timestamp: now - 30,
    },
  ],
};

/**
 * Valid LocationProof with single stamp
 */
export const VALID_PROOF: LocationProof = {
  claim: VALID_CLAIM,
  stamps: [VALID_STAMP],
};

/**
 * Stamp that is outside the claim radius
 */
export const STAMP_OUTSIDE_RADIUS: LocationStamp = {
  ...VALID_STAMP,
  location: { type: 'Point', coordinates: [-122.5, 37.8] }, // ~10km away
};

/**
 * Stamp with temporal mismatch
 */
export const STAMP_TEMPORAL_MISMATCH: LocationStamp = {
  ...VALID_STAMP,
  temporalFootprint: { start: now - 3600, end: now - 1800 }, // 1 hour ago
};

/**
 * Stamp with invalid signature format
 */
export const STAMP_INVALID_SIGNATURE: LocationStamp = {
  ...VALID_STAMP,
  signatures: [
    {
      ...VALID_STAMP.signatures[0],
      value: 'not-a-hex-signature',
    },
  ],
};

/**
 * Stamp with missing required fields
 */
export const STAMP_MISSING_FIELDS: Partial<LocationStamp> = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  // Missing location, plugin, signatures, etc.
};

/**
 * Second valid stamp (still proofmode, but simulates a different session)
 * For future: use witnesschain when that plugin is implemented
 */
export const VALID_STAMP_SECOND: LocationStamp = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4195, 37.775] }, // Slightly different
  srs: SRS,
  temporalFootprint: { start: now - 90, end: now + 30 },
  plugin: 'proofmode', // Using proofmode since witnesschain isn't implemented yet
  pluginVersion: '0.1.0',
  signals: {
    deviceType: 'tablet',
    accuracy: 15,
    session: 2,
  },
  signatures: [
    {
      signer: { scheme: 'device-pubkey', value: '0x9876543210fedcba' },
      algorithm: 'secp256k1',
      value: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba098765432100',
      timestamp: now - 45,
    },
  ],
};

/**
 * Multi-stamp proof with two stamps
 * Note: Both stamps use proofmode since witnesschain isn't implemented yet
 */
export const MULTI_STAMP_PROOF: LocationProof = {
  claim: VALID_CLAIM,
  stamps: [VALID_STAMP, VALID_STAMP_SECOND],
};

/**
 * Multi-stamp proof with redundant stamps (same plugin)
 */
export const REDUNDANT_STAMP_PROOF: LocationProof = {
  claim: VALID_CLAIM,
  stamps: [VALID_STAMP, { ...VALID_STAMP, signals: { ...VALID_STAMP.signals, session: 2 } }],
};

/**
 * Claim with NYC location (for testing with different stamps)
 */
export const NYC_CLAIM: LocationClaim = {
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
  srs: SRS,
  subject: { scheme: 'eth-address', value: '0x1234567890123456789012345678901234567890' },
  radius: 50,
  time: { start: now - 60, end: now },
  eventType: 'presence',
};

/**
 * Helper to make verify proof request
 */
export function makeVerifyRequest(proof: LocationProof, options?: Record<string, unknown>) {
  return {
    proof,
    options: {
      chainId: TEST_CHAIN_ID,
      schema: TEST_SCHEMA_UID,
      recipient: TEST_RECIPIENT,
      ...options,
    },
  };
}

// ============================================
// GPSD Stamps
// ============================================

/**
 * Valid GPSD stamp — GPS hardware fix at San Francisco.
 * Signal shape matches real plugin-gpsd output.
 */
export const VALID_GPSD_STAMP: LocationStamp = signStamp({
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
  srs: SRS,
  temporalFootprint: { start: now - 120, end: now + 60 },
  plugin: 'gpsd',
  pluginVersion: '0.1.0',
  signals: {
    source: 'gpsd',
    accuracyMeters: 5,
    mode: 3,
  },
}, now - 30);

// ============================================
// GeoClue Stamps
// ============================================

/**
 * Valid GeoClue stamp — Linux system location at San Francisco.
 * Signal shape matches real plugin-geoclue output.
 */
export const VALID_GEOCLUE_STAMP: LocationStamp = signStamp({
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4195, 37.775] },
  srs: SRS,
  temporalFootprint: { start: now - 90, end: now + 30 },
  plugin: 'geoclue',
  pluginVersion: '0.1.0',
  signals: {
    source: 'geoclue2',
    accuracyMeters: 50,
    platform: 'linux',
  },
}, now - 20);

// ============================================
// WiFi MLS Stamps
// ============================================

/**
 * Valid WiFi MLS stamp — WiFi AP scan at San Francisco.
 * Signal shape matches real plugin-wifi-mls output.
 */
export const VALID_WIFI_MLS_STAMP: LocationStamp = signStamp({
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4196, 37.7748] },
  srs: SRS,
  temporalFootprint: { start: now - 100, end: now + 40 },
  plugin: 'wifi-mls',
  pluginVersion: '0.1.0',
  signals: {
    source: 'wifi',
    accuracyMeters: 100,
    apCount: 5,
  },
}, now - 25);

// ============================================
// IP Geolocation Stamps
// ============================================

/**
 * Valid IP geolocation stamp — lookup at San Francisco.
 * Signal shape matches real plugin-ip-geolocation output.
 */
export const VALID_IP_GEO_STAMP: LocationStamp = signStamp({
  lpVersion: '0.2',
  locationType: 'geojson-point',
  location: { type: 'Point', coordinates: [-122.4, 37.78] },
  srs: SRS,
  temporalFootprint: { start: now - 110, end: now + 50 },
  plugin: 'ip-geolocation',
  pluginVersion: '0.1.0',
  signals: {
    source: 'ip-geolocation',
    accuracyMeters: 25000,
    ip: '203.0.113.42',
    city: 'San Francisco',
  },
}, now - 35);

// ============================================
// Multi-Plugin Proofs
// ============================================

/**
 * Multi-plugin proof: gpsd + wifi-mls + ip-geolocation
 * Tests high plugin diversity across stamp types.
 */
export const MULTI_PLUGIN_PROOF: LocationProof = {
  claim: VALID_CLAIM,
  stamps: [VALID_GPSD_STAMP, VALID_WIFI_MLS_STAMP, VALID_IP_GEO_STAMP],
};

/**
 * Helper to make verify stamp request
 */
export function makeStampRequest(stamp: LocationStamp) {
  return { stamp };
}
