/**
 * Integration tests for POST /verify/v0/proof endpoint.
 *
 * Asserts on the SDK-aligned VerifiedLocationProof response shape:
 * - credibility: CredibilityVector with dimensions + stampResults + meta
 * - attestation: full EAS struct (uid, schema, attester, ...)
 * - evaluationMethod, evaluatedAt, chainId
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createVerifyTestApp } from '../../helpers/verify-test-server.js';
import {
  VALID_PROOF,
  MULTI_STAMP_PROOF,
  REDUNDANT_STAMP_PROOF,
  STAMP_OUTSIDE_RADIUS,
  STAMP_TEMPORAL_MISMATCH,
  NYC_CLAIM,
  makeVerifyRequest,
} from '../../fixtures/verify.js';
import { TEST_SCHEMA_UID, TEST_RECIPIENT } from '../../fixtures/geometries.js';

const app = createVerifyTestApp();

describe('POST /verify/v0/proof', () => {
  describe('successful verification', () => {
    it('verifies a valid single-stamp proof', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(VALID_PROOF));

      expect(res.status).toBe(200);

      // Check CredibilityVector structure
      const { credibility } = res.body;
      expect(credibility).toBeDefined();
      expect(credibility.dimensions).toBeDefined();
      expect(credibility.dimensions.spatial).toBeDefined();
      expect(credibility.dimensions.temporal).toBeDefined();
      expect(credibility.dimensions.validity).toBeDefined();
      expect(credibility.dimensions.independence).toBeDefined();
      expect(credibility.meta.stampCount).toBe(1);
      expect(credibility.meta.evaluationMode).toBe('tee');
      expect(credibility.stampResults).toHaveLength(1);

      // Check stamp result (raw measurements, no scores)
      const stampResult = credibility.stampResults[0];
      expect(stampResult.stampIndex).toBe(0);
      expect(stampResult.plugin).toBe('proofmode');
      expect(stampResult.signaturesValid).toBe(true);
      expect(stampResult.structureValid).toBe(true);
      expect(stampResult.distanceMeters).toBeTypeOf('number');
      expect(stampResult.temporalOverlap).toBeTypeOf('number');
      expect(stampResult.withinRadius).toBe(true);
      expect(stampResult.details).toBeDefined();

      // Check VerifiedLocationProof response structure
      expect(res.body.proof).toBeDefined();
      expect(res.body.evaluationMethod).toBe('astral-v0.3.0-tee');
      expect(res.body.evaluatedAt).toBeTypeOf('number');
      expect(res.body.chainId).toBeTypeOf('number');

      // Check attestation (full EAS struct)
      const { attestation } = res.body;
      expect(attestation).toBeDefined();
      expect(attestation.uid).toMatch(/^0x[a-f0-9]{64}$/);
      expect(attestation.schema).toBe(TEST_SCHEMA_UID);
      expect(attestation.attester).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(attestation.recipient).toBe(TEST_RECIPIENT);
      expect(attestation.revocable).toBe(true);
      expect(attestation.data).toMatch(/^0x/);
      expect(attestation.time).toBeTypeOf('number');
      expect(attestation.expirationTime).toBe(0);
      expect(attestation.revocationTime).toBe(0);
      expect(attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/);

      // Check delegated attestation
      expect(res.body.delegatedAttestation).toBeDefined();
      expect(res.body.delegatedAttestation.deadline).toBeTypeOf('number');
      expect(res.body.delegatedAttestation.nonce).toBeTypeOf('number');
    });

    it('verifies a multi-stamp proof with independence dimensions', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(MULTI_STAMP_PROOF));

      expect(res.status).toBe(200);
      expect(res.body.credibility.stampResults).toHaveLength(2);

      // Multi-stamp: independence dimension reflects plugin diversity
      const { independence } = res.body.credibility.dimensions;
      expect(independence.uniquePluginRatio).toBeGreaterThanOrEqual(0);
      expect(independence.pluginNames).toBeInstanceOf(Array);
      expect(independence.spatialAgreement).toBeGreaterThan(0);
    });

    it('handles redundant stamps (same plugin) appropriately', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(REDUNDANT_STAMP_PROOF));

      expect(res.status).toBe(200);

      // Both stamps from same plugin → low uniquePluginRatio
      const { independence } = res.body.credibility.dimensions;
      expect(independence.uniquePluginRatio).toBeLessThanOrEqual(0.5);
      expect(independence.pluginNames).toEqual(['proofmode']);
    });
  });

  describe('claim assessment', () => {
    it('detects stamp outside claim radius', async () => {
      const proof = {
        claim: VALID_PROOF.claim,
        stamps: [STAMP_OUTSIDE_RADIUS],
      };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(proof));

      expect(res.status).toBe(200);

      // Stamp should be valid but outside radius
      const stampResult = res.body.credibility.stampResults[0];
      expect(stampResult.signaturesValid).toBe(true);
      expect(stampResult.structureValid).toBe(true);
      expect(stampResult.withinRadius).toBe(false);
      expect(stampResult.distanceMeters).toBeGreaterThan(100); // Claim radius is 100m

      // Spatial dimension should reflect the distance
      const { spatial } = res.body.credibility.dimensions;
      expect(spatial.withinRadiusFraction).toBe(0);
      expect(spatial.meanDistanceMeters).toBeGreaterThan(100);
    });

    it('detects temporal mismatch between stamp and claim', async () => {
      const proof = {
        claim: VALID_PROOF.claim,
        stamps: [STAMP_TEMPORAL_MISMATCH],
      };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(proof));

      expect(res.status).toBe(200);

      // Temporal mismatch → low overlap
      const stampResult = res.body.credibility.stampResults[0];
      expect(stampResult.temporalOverlap).toBeLessThan(1.0);

      // Temporal dimension should reflect the mismatch
      const { temporal } = res.body.credibility.dimensions;
      expect(temporal.meanOverlap).toBeLessThan(1.0);
    });
  });

  describe('validation errors', () => {
    it('rejects missing proof', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send({ options: { chainId: 84532 } });

      expect(res.status).toBe(400);
    });

    it('rejects proof with empty stamps array', async () => {
      const proof = { claim: VALID_PROOF.claim, stamps: [] };
      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(proof));

      expect(res.status).toBe(400);
    });

    it('rejects invalid claim format', async () => {
      const invalidProof = {
        claim: { ...VALID_PROOF.claim, lpVersion: 'invalid' },
        stamps: VALID_PROOF.stamps,
      };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(invalidProof));

      expect(res.status).toBe(400);
    });

    it('rejects claim with missing radius', async () => {
      const claim = { ...VALID_PROOF.claim };
      delete (claim as Record<string, unknown>).radius;
      const invalidProof = { claim, stamps: VALID_PROOF.stamps };

      const res = await request(app)
        .post('/verify/v0/proof')
        .send(makeVerifyRequest(invalidProof));

      expect(res.status).toBe(400);
    });
  });

  describe('response format', () => {
    it('returns RFC 7807 problem details on error', async () => {
      const res = await request(app)
        .post('/verify/v0/proof')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        type: expect.stringContaining('astral.global/errors'),
        title: expect.any(String),
        status: 400,
        detail: expect.any(String),
        instance: '/verify/v0/proof',
      });
    });
  });
});
