/**
 * Attestation round-trip verification tests.
 *
 * These tests verify that the attestation data returned by the API:
 * 1. Can be decoded using the EAS SchemaEncoder
 * 2. Contains the correct values matching the response
 * 3. Would be verifiable onchain
 *
 * This is the core verification that proves the attestation is actually useful.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { createTestApp } from '../../helpers/test-server.js';
import {
  verifySignature,
  TEST_ATTESTER,
} from '../../helpers/signature.js';
import {
  SF_POINT,
  NYC_POINT,
  GOLDEN_GATE_PARK,
  SIMPLE_LINE,
  POINT_IN_PARK,
  makeRequest,
} from '../../fixtures/geometries.js';
import {
  NUMERIC_POLICY_SCHEMA,
  BOOLEAN_POLICY_SCHEMA,
  SCALE_FACTORS,
} from '../../../src/signing/schemas.js';

const app = createTestApp();

describe('Attestation Round-Trip Verification', () => {
  describe('Numeric attestations (distance, area, length)', () => {
    it('distance attestation data can be decoded and matches response', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      // Decode the attestation data
      const encoder = new SchemaEncoder(NUMERIC_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      // Extract values from decoded data
      const decodedValues: Record<string, unknown> = {};
      for (const item of decoded) {
        decodedValues[item.name] = item.value.value;
      }

      // Verify decoded values match response
      // Result is scaled to centimeters in attestation
      const expectedScaledResult = BigInt(Math.round(res.body.result * Number(SCALE_FACTORS.DISTANCE)));
      expect(decodedValues.result).toBe(expectedScaledResult);
      expect(decodedValues.units).toBe('centimeters');
      expect(decodedValues.operation).toBe('distance');
      expect(decodedValues.timestamp).toBe(BigInt(res.body.timestamp));

      // Verify input refs match
      const decodedRefs = decodedValues.inputRefs as string[];
      expect(decodedRefs).toHaveLength(2);
      expect(decodedRefs[0]).toBe(res.body.inputRefs[0]);
      expect(decodedRefs[1]).toBe(res.body.inputRefs[1]);
    });

    it('area attestation data can be decoded and matches response', async () => {
      const res = await request(app)
        .post('/compute/v0/area')
        .send(makeRequest({ geometry: GOLDEN_GATE_PARK }));

      expect(res.status).toBe(200);

      const encoder = new SchemaEncoder(NUMERIC_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      const decodedValues: Record<string, unknown> = {};
      for (const item of decoded) {
        decodedValues[item.name] = item.value.value;
      }

      // Area is scaled to square centimeters
      const expectedScaledResult = BigInt(Math.round(res.body.result * Number(SCALE_FACTORS.AREA)));
      expect(decodedValues.result).toBe(expectedScaledResult);
      expect(decodedValues.units).toBe('square_centimeters');
      expect(decodedValues.operation).toBe('area');
    });

    it('length attestation data can be decoded and matches response', async () => {
      const res = await request(app)
        .post('/compute/v0/length')
        .send(makeRequest({ geometry: SIMPLE_LINE }));

      expect(res.status).toBe(200);

      const encoder = new SchemaEncoder(NUMERIC_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      const decodedValues: Record<string, unknown> = {};
      for (const item of decoded) {
        decodedValues[item.name] = item.value.value;
      }

      const expectedScaledResult = BigInt(Math.round(res.body.result * Number(SCALE_FACTORS.LENGTH)));
      expect(decodedValues.result).toBe(expectedScaledResult);
      expect(decodedValues.units).toBe('centimeters');
      expect(decodedValues.operation).toBe('length');
    });
  });

  describe('Boolean attestations (contains, within, intersects)', () => {
    it('contains attestation data can be decoded and matches response', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: GOLDEN_GATE_PARK, containee: POINT_IN_PARK }));

      expect(res.status).toBe(200);

      const encoder = new SchemaEncoder(BOOLEAN_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      const decodedValues: Record<string, unknown> = {};
      for (const item of decoded) {
        decodedValues[item.name] = item.value.value;
      }

      expect(decodedValues.result).toBe(res.body.result);
      expect(decodedValues.operation).toBe('contains');
      expect(decodedValues.timestamp).toBe(BigInt(res.body.timestamp));
    });

    it('within attestation includes radius in operation string', async () => {
      const radius = 5000; // 5km
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({ geometry: SF_POINT, target: GOLDEN_GATE_PARK, radius }));

      expect(res.status).toBe(200);

      const encoder = new SchemaEncoder(BOOLEAN_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      const decodedValues: Record<string, unknown> = {};
      for (const item of decoded) {
        decodedValues[item.name] = item.value.value;
      }

      // Radius should be encoded in operation string as centimeters
      const expectedOperation = `within:${radius * 100}`;
      expect(decodedValues.operation).toBe(expectedOperation);
      expect(res.body.operation).toBe(expectedOperation);
    });

    it('intersects attestation data can be decoded and matches response', async () => {
      const res = await request(app)
        .post('/compute/v0/intersects')
        .send(makeRequest({ geometry1: GOLDEN_GATE_PARK, geometry2: POINT_IN_PARK }));

      expect(res.status).toBe(200);

      const encoder = new SchemaEncoder(BOOLEAN_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      const decodedValues: Record<string, unknown> = {};
      for (const item of decoded) {
        decodedValues[item.name] = item.value.value;
      }

      expect(decodedValues.result).toBe(res.body.result);
      expect(decodedValues.operation).toBe('intersects');
    });
  });

  describe('Signature verification', () => {
    it('signature can be cryptographically verified', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      // Use shared helper to verify signature
      const recoveredAddress = verifySignature(res.body);

      // Verify the recovered address matches the attester
      expect(recoveredAddress.toLowerCase()).toBe(res.body.attestation.attester.toLowerCase());
    });

    it('signature format is valid', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      const { attestation, delegatedAttestation } = res.body;

      // Signature should be 65 bytes (130 hex chars + 0x prefix)
      expect(attestation.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

      // Attester address should match the test signer (Hardhat account #0)
      expect(attestation.attester).toBe(TEST_ATTESTER);

      // Deadline should be in the future
      expect(delegatedAttestation.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));

      // Nonce should be present and non-negative
      expect(delegatedAttestation.nonce).toBeTypeOf('number');
      expect(delegatedAttestation.nonce).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Input reference consistency', () => {
    it('same geometry always produces same input ref', async () => {
      // Make two requests with the same geometry
      const res1 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      const res2 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Input refs should be identical
      expect(res1.body.inputRefs[0]).toBe(res2.body.inputRefs[0]);
      expect(res1.body.inputRefs[1]).toBe(res2.body.inputRefs[1]);

      // But nonces (and thus signatures) should be different
      expect(res1.body.attestation.signature).not.toBe(res2.body.attestation.signature);
    });

    it('input refs in response match input refs in decoded attestation', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      const encoder = new SchemaEncoder(NUMERIC_POLICY_SCHEMA);
      const decoded = encoder.decodeData(res.body.attestation.data);

      const inputRefsItem = decoded.find(item => item.name === 'inputRefs');
      const decodedRefs = inputRefsItem?.value.value as string[];

      // Response inputRefs should exactly match what's in the signed attestation
      expect(res.body.inputRefs).toEqual(decodedRefs);
    });
  });
});
