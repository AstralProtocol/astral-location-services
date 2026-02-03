/**
 * Tests for attestation data encoding and verification.
 *
 * Verifies that attestation data can be decoded and matches the expected values.
 * This ensures the data is usable by onchain contracts.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { ethers } from 'ethers';
import { createTestApp } from '../../helpers/test-server.js';
import {
  SF_POINT,
  NYC_POINT,
  GOLDEN_GATE_PARK,
  POINT_IN_PARK,
  makeRequest,
} from '../../fixtures/geometries.js';
import { TEST_ATTESTER } from '../../helpers/signature.js';

const app = createTestApp();

// ABI for decoding attestation data
const BOOLEAN_SCHEMA_TYPES = ['bool', 'bytes32[]', 'uint256', 'string'];
const NUMERIC_SCHEMA_TYPES = ['uint256', 'string', 'bytes32[]', 'uint256', 'string'];

describe('Attestation Data Encoding', () => {
  describe('numeric attestations (distance)', () => {
    it('encodes distance result correctly', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      // Decode the attestation data
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const decoded = abiCoder.decode(NUMERIC_SCHEMA_TYPES, res.body.attestation.data);

      const [result, units, inputRefs, timestamp, operation] = decoded;

      // Result should be distance in centimeters (scaled by 100)
      // SF to NYC is ~4,130 km = ~413,000,000 cm
      expect(result).toBeGreaterThan(390_000_000n);
      expect(result).toBeLessThan(440_000_000n);

      // Units should be centimeters
      expect(units).toBe('centimeters');

      // Should have 2 input refs
      expect(inputRefs).toHaveLength(2);
      expect(inputRefs[0]).toMatch(/^0x[a-f0-9]{64}$/);
      expect(inputRefs[1]).toMatch(/^0x[a-f0-9]{64}$/);

      // Timestamp should be recent (within last hour)
      const now = Math.floor(Date.now() / 1000);
      expect(Number(timestamp)).toBeGreaterThan(now - 3600);
      expect(Number(timestamp)).toBeLessThanOrEqual(now + 60);

      // Operation should be 'distance'
      expect(operation).toBe('distance');
    });

    it('input refs match response inputRefs', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const decoded = abiCoder.decode(NUMERIC_SCHEMA_TYPES, res.body.attestation.data);
      const [, , inputRefs] = decoded;

      // Decoded refs should match response refs
      expect(inputRefs[0]).toBe(res.body.inputRefs[0]);
      expect(inputRefs[1]).toBe(res.body.inputRefs[1]);
    });
  });

  describe('boolean attestations (contains)', () => {
    it('encodes true result correctly', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: POINT_IN_PARK,
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(true);

      // Decode the attestation data
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const decoded = abiCoder.decode(BOOLEAN_SCHEMA_TYPES, res.body.attestation.data);

      const [result, inputRefs, timestamp, operation] = decoded;

      // Result should be true
      expect(result).toBe(true);

      // Should have 2 input refs
      expect(inputRefs).toHaveLength(2);

      // Timestamp should be recent
      const now = Math.floor(Date.now() / 1000);
      expect(Number(timestamp)).toBeGreaterThan(now - 3600);

      // Operation should be 'contains'
      expect(operation).toBe('contains');
    });

    it('encodes false result correctly', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({
          container: GOLDEN_GATE_PARK,
          containee: SF_POINT, // Not in the park
        }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBe(false);

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const decoded = abiCoder.decode(BOOLEAN_SCHEMA_TYPES, res.body.attestation.data);

      const [result] = decoded;
      expect(result).toBe(false);
    });

    it('encodes within operation with radius in operation string', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({
          geometry: POINT_IN_PARK,
          target: SF_POINT,
          radius: 500, // 500 meters
        }));

      expect(res.status).toBe(200);

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const decoded = abiCoder.decode(BOOLEAN_SCHEMA_TYPES, res.body.attestation.data);

      const [, , , operation] = decoded;

      // Operation should include radius in centimeters
      expect(operation).toBe('within:50000'); // 500m = 50000cm
    });
  });

  describe('attestation metadata', () => {
    it('attester matches expected test attester', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);
      expect(res.body.attestation.attester.toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });

    it('schema UID matches request schema', async () => {
      const schemaUid = '0x0000000000000000000000000000000000000000000000000000000000000001';

      const res = await request(app)
        .post('/compute/v0/distance')
        .send({
          chainId: 84532,
          schema: schemaUid,
          from: SF_POINT,
          to: NYC_POINT,
        });

      expect(res.status).toBe(200);
      expect(res.body.attestation.schema).toBe(schemaUid);
    });

    it('recipient defaults to zero address when not specified', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send({
          chainId: 84532,
          schema: '0x0000000000000000000000000000000000000000000000000000000000000001',
          from: SF_POINT,
          to: NYC_POINT,
          // No recipient specified
        });

      expect(res.status).toBe(200);
      expect(res.body.attestation.recipient).toBe('0x0000000000000000000000000000000000000000');
    });

    it('recipient is set when specified', async () => {
      const recipient = '0x1234567890123456789012345678901234567890';

      const res = await request(app)
        .post('/compute/v0/distance')
        .send({
          chainId: 84532,
          schema: '0x0000000000000000000000000000000000000000000000000000000000000001',
          from: SF_POINT,
          to: NYC_POINT,
          recipient,
        });

      expect(res.status).toBe(200);
      expect(res.body.attestation.recipient.toLowerCase()).toBe(recipient.toLowerCase());
    });

    it('deadline is approximately 1 hour in the future', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      const now = Math.floor(Date.now() / 1000);
      const deadline = res.body.delegatedAttestation.deadline;

      // Deadline should be ~1 hour from now (with some tolerance)
      expect(deadline).toBeGreaterThan(now + 3500); // > 58 minutes
      expect(deadline).toBeLessThan(now + 3700); // < 62 minutes
    });

    it('nonce reflects EAS state (unchanged without submissions)', async () => {
      const res1 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      const res2 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Nonces are queried from EAS - without actual submissions, they stay the same
      expect(res2.body.delegatedAttestation.nonce).toBe(
        res1.body.delegatedAttestation.nonce
      );
    });
  });
});
