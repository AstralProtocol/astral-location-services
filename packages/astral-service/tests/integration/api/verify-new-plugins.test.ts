/**
 * E2E integration tests for new verification plugins (gpsd, geoclue, wifi-mls, ip-geolocation).
 *
 * Each plugin is tested through the full HTTP pipeline:
 * POST /verify/v0/proof → validation → verify → evaluate → attest → response
 *
 * Tests cover:
 * - Single-plugin proofs produce correct CredibilityVector dimensions
 * - Plugin-specific signals appear in stamp details
 * - Invalid stamps (wrong signer, bad signals) are detected and reflected in dimensions
 * - Cross-plugin proofs with spatial disagreement
 * - All four plugins combined in a single proof
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createVerifyTestApp } from '../../helpers/verify-test-server.js';
import {
  VALID_CLAIM,
  VALID_GPSD_STAMP,
  VALID_GEOCLUE_STAMP,
  VALID_WIFI_MLS_STAMP,
  VALID_IP_GEO_STAMP,
  NYC_CLAIM,
  signStamp,
  signStampWrongSigner,
  makeVerifyRequest,
} from '../../fixtures/verify.js';
import { TEST_SCHEMA_UID, TEST_RECIPIENT } from '../../fixtures/geometries.js';
import type { LocationProof } from '../../../src/types/verify.js';

const app = createVerifyTestApp();

// Helper: build a single-stamp proof
function singleStampProof(stamp: typeof VALID_GPSD_STAMP): LocationProof {
  return { claim: VALID_CLAIM, stamps: [stamp] };
}

describe('POST /verify/v0/proof — new plugins E2E', () => {
  // ============================================
  // Per-plugin happy paths
  // ============================================

  describe('GPSD plugin', () => {
    it('verifies a single GPSD stamp end-to-end', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(singleStampProof(VALID_GPSD_STAMP)));

      expect(res.status).toBe(200);

      const { credibility } = res.body;
      expect(credibility.stampResults).toHaveLength(1);

      const sr = credibility.stampResults[0];
      expect(sr.plugin).toBe('gpsd');
      expect(sr.signaturesValid).toBe(true);
      expect(sr.structureValid).toBe(true);
      expect(sr.signalsConsistent).toBe(true);
      expect(sr.withinRadius).toBe(true);
      expect(sr.distanceMeters).toBeTypeOf('number');
      expect(sr.distanceMeters).toBeLessThan(100); // Same location as claim

      // Temporal: stamp fully covers claim
      expect(sr.temporalOverlap).toBe(1.0);

      // Dimensions populated
      expect(credibility.dimensions.spatial.withinRadiusFraction).toBe(1);
      expect(credibility.dimensions.validity.signaturesValidFraction).toBe(1);
      expect(credibility.dimensions.independence.pluginNames).toEqual(['gpsd']);

      // Full response structure
      expect(res.body.attestation.uid).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.body.attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(res.body.evaluationMethod).toBe('astral-v0.3.0-tee');
    });
  });

  describe('GeoClue plugin', () => {
    it('verifies a single GeoClue stamp end-to-end', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(singleStampProof(VALID_GEOCLUE_STAMP)));

      expect(res.status).toBe(200);

      const sr = res.body.credibility.stampResults[0];
      expect(sr.plugin).toBe('geoclue');
      expect(sr.signaturesValid).toBe(true);
      expect(sr.structureValid).toBe(true);
      expect(sr.signalsConsistent).toBe(true);
      expect(sr.withinRadius).toBe(true);
      expect(sr.temporalOverlap).toBe(1.0);

      expect(res.body.credibility.dimensions.independence.pluginNames).toEqual(['geoclue']);
      expect(res.body.attestation.uid).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('WiFi MLS plugin', () => {
    it('verifies a single WiFi MLS stamp end-to-end', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(singleStampProof(VALID_WIFI_MLS_STAMP)));

      expect(res.status).toBe(200);

      const sr = res.body.credibility.stampResults[0];
      expect(sr.plugin).toBe('wifi-mls');
      expect(sr.signaturesValid).toBe(true);
      expect(sr.structureValid).toBe(true);
      expect(sr.signalsConsistent).toBe(true);
      expect(sr.withinRadius).toBe(true);
      expect(sr.temporalOverlap).toBe(1.0);

      expect(res.body.credibility.dimensions.independence.pluginNames).toEqual(['wifi-mls']);
      expect(res.body.attestation.uid).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('IP Geolocation plugin', () => {
    it('verifies a single IP geolocation stamp end-to-end', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(singleStampProof(VALID_IP_GEO_STAMP)));

      expect(res.status).toBe(200);

      const sr = res.body.credibility.stampResults[0];
      expect(sr.plugin).toBe('ip-geolocation');
      expect(sr.signaturesValid).toBe(true);
      expect(sr.structureValid).toBe(true);
      expect(sr.signalsConsistent).toBe(true);
      // IP geolocation uses 25km default accuracy → withinRadius depends on effectiveRadius
      expect(sr.withinRadius).toBe(true);
      expect(sr.temporalOverlap).toBe(1.0);

      expect(res.body.credibility.dimensions.independence.pluginNames).toEqual(['ip-geolocation']);
      expect(res.body.attestation.uid).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  // ============================================
  // Signature verification through HTTP pipeline
  // ============================================

  describe('signature mismatch detection', () => {
    it('flags GPSD stamp with wrong signer in validity dimensions', async () => {
      const now = Math.floor(Date.now() / 1000);
      const { signatures: _, ...unsigned } = VALID_GPSD_STAMP;
      const badStamp = signStampWrongSigner(unsigned, now);
      const proof: LocationProof = { claim: VALID_CLAIM, stamps: [badStamp] };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(proof));

      expect(res.status).toBe(200);

      const sr = res.body.credibility.stampResults[0];
      expect(sr.signaturesValid).toBe(false);

      // Validity dimension reflects the failure
      expect(res.body.credibility.dimensions.validity.signaturesValidFraction).toBe(0);
    });
  });

  // ============================================
  // Cross-plugin spatial disagreement
  // ============================================

  describe('spatial disagreement', () => {
    it('detects when stamps from different plugins disagree on location', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Create a GPSD stamp at NYC (far from SF claim)
      const nycGpsdStamp = signStamp({
        lpVersion: '0.2',
        locationType: 'geojson-point',
        location: { type: 'Point', coordinates: [-73.9857, 40.7484] },
        srs: 'EPSG:4326',
        temporalFootprint: { start: now - 120, end: now + 60 },
        plugin: 'gpsd',
        pluginVersion: '0.1.0',
        signals: {
          source: 'gpsd',
          accuracyMeters: 5,
          mode: 3,
        },
      }, now - 30);

      // SF claim with one SF stamp (wifi-mls) and one NYC stamp (gpsd)
      const proof: LocationProof = {
        claim: VALID_CLAIM,
        stamps: [VALID_WIFI_MLS_STAMP, nycGpsdStamp],
      };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(proof));

      expect(res.status).toBe(200);

      const { credibility } = res.body;
      expect(credibility.stampResults).toHaveLength(2);

      // WiFi stamp in SF should be within radius; GPSD in NYC should not
      const wifiResult = credibility.stampResults[0];
      const gpsdResult = credibility.stampResults[1];
      expect(wifiResult.withinRadius).toBe(true);
      expect(gpsdResult.withinRadius).toBe(false);
      expect(gpsdResult.distanceMeters).toBeGreaterThan(4_000_000); // ~4100km SF→NYC

      // Spatial dimension reflects disagreement
      expect(credibility.dimensions.spatial.withinRadiusFraction).toBe(0.5);

      // Independence: two unique plugins
      expect(credibility.dimensions.independence.uniquePluginRatio).toBe(1.0);
      expect(credibility.dimensions.independence.pluginNames).toHaveLength(2);
    });
  });

  // ============================================
  // All four new plugins combined
  // ============================================

  describe('four-plugin proof', () => {
    it('verifies all four new plugins in a single proof', async () => {
      const proof: LocationProof = {
        claim: VALID_CLAIM,
        stamps: [
          VALID_GPSD_STAMP,
          VALID_GEOCLUE_STAMP,
          VALID_WIFI_MLS_STAMP,
          VALID_IP_GEO_STAMP,
        ],
      };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(proof));

      expect(res.status).toBe(200);

      const { credibility } = res.body;
      expect(credibility.stampResults).toHaveLength(4);
      expect(credibility.meta.stampCount).toBe(4);

      // All stamps valid
      for (const sr of credibility.stampResults) {
        expect(sr.signaturesValid).toBe(true);
        expect(sr.structureValid).toBe(true);
        expect(sr.signalsConsistent).toBe(true);
      }

      // All four plugin names present
      const { independence } = credibility.dimensions;
      expect(independence.uniquePluginRatio).toBe(1.0);
      expect(independence.pluginNames).toHaveLength(4);
      expect(independence.pluginNames).toContain('gpsd');
      expect(independence.pluginNames).toContain('geoclue');
      expect(independence.pluginNames).toContain('wifi-mls');
      expect(independence.pluginNames).toContain('ip-geolocation');

      // All near SF → high spatial agreement, all within radius
      expect(credibility.dimensions.spatial.withinRadiusFraction).toBe(1);
      expect(credibility.dimensions.spatial.meanDistanceMeters).toBeLessThan(2500);

      // All fully overlapping claim window
      expect(credibility.dimensions.temporal.fullyOverlappingFraction).toBe(1);

      // All valid
      expect(credibility.dimensions.validity.signaturesValidFraction).toBe(1);
      expect(credibility.dimensions.validity.structureValidFraction).toBe(1);
      expect(credibility.dimensions.validity.signalsConsistentFraction).toBe(1);

      // Attestation signed
      expect(res.body.attestation.uid).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.body.attestation.schema).toBe(TEST_SCHEMA_UID);
      expect(res.body.attestation.recipient).toBe(TEST_RECIPIENT);
      expect(res.body.attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    });
  });
});
