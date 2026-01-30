/**
 * Signature verification tests.
 *
 * These tests verify that signatures produced by the compute service
 * are cryptographically valid EIP-712 signatures that can be verified
 * both offchain (using ethers) and would be accepted by the EAS contract.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { verifyTypedData } from 'ethers';
import { createTestApp } from '../../helpers/test-server.js';
import {
  verifySignature,
  EAS_DOMAIN,
  EAS_ATTEST_TYPES,
  TEST_ATTESTER,
  ZERO_REF_UID,
} from '../../helpers/signature.js';
import {
  SF_POINT,
  NYC_POINT,
  GOLDEN_GATE_PARK,
  POINT_IN_PARK,
  makeRequest,
} from '../../fixtures/geometries.js';

const app = createTestApp();

describe('Signature Verification', () => {
  describe('EIP-712 typed data verification', () => {
    it('verifies distance operation signature', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      const recovered = verifySignature(res.body);
      expect(recovered.toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });

    it('verifies area operation signature', async () => {
      const res = await request(app)
        .post('/compute/v0/area')
        .send(makeRequest({ geometry: GOLDEN_GATE_PARK }));

      expect(res.status).toBe(200);

      const recovered = verifySignature(res.body);
      expect(recovered.toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });

    it('verifies contains operation signature', async () => {
      const res = await request(app)
        .post('/compute/v0/contains')
        .send(makeRequest({ container: GOLDEN_GATE_PARK, containee: POINT_IN_PARK }));

      expect(res.status).toBe(200);

      const recovered = verifySignature(res.body);
      expect(recovered.toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });

    it('verifies within operation signature', async () => {
      const res = await request(app)
        .post('/compute/v0/within')
        .send(makeRequest({ geometry: SF_POINT, target: GOLDEN_GATE_PARK, radius: 5000 }));

      expect(res.status).toBe(200);

      const recovered = verifySignature(res.body);
      expect(recovered.toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });

    it('verifies intersects operation signature', async () => {
      const res = await request(app)
        .post('/compute/v0/intersects')
        .send(makeRequest({ geometry1: GOLDEN_GATE_PARK, geometry2: POINT_IN_PARK }));

      expect(res.status).toBe(200);

      const recovered = verifySignature(res.body);
      expect(recovered.toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });
  });

  describe('Signature determinism', () => {
    it('produces identical signatures for same inputs when nonce unchanged', async () => {
      const res1 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      const res2 = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Nonces are queried from EAS - without actual submissions, they stay the same
      // This is correct behavior: nonce reflects on-chain state
      expect(res1.body.delegatedAttestation.nonce).toBe(
        res2.body.delegatedAttestation.nonce
      );

      // With same nonce and same inputs, signatures are deterministic
      expect(res1.body.attestation.signature).toBe(
        res2.body.attestation.signature
      );

      // Both should verify correctly
      expect(verifySignature(res1.body).toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
      expect(verifySignature(res2.body).toLowerCase()).toBe(TEST_ATTESTER.toLowerCase());
    });
  });

  describe('Signature tampering detection', () => {
    it('rejects verification with wrong recipient', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      // Try to verify with tampered data (wrong recipient)
      const tamperedMessage = {
        schema: res.body.attestation.schema,
        recipient: '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF', // Wrong recipient
        expirationTime: 0n,
        revocable: true,
        refUID: ZERO_REF_UID,
        data: res.body.attestation.data,
        value: 0n,
        nonce: BigInt(res.body.delegatedAttestation.nonce),
        deadline: BigInt(res.body.delegatedAttestation.deadline),
      };

      const recovered = verifyTypedData(
        EAS_DOMAIN,
        EAS_ATTEST_TYPES,
        tamperedMessage,
        res.body.attestation.signature
      );

      // Should NOT match the attester (recovered address will be different)
      expect(recovered.toLowerCase()).not.toBe(TEST_ATTESTER.toLowerCase());
    });

    it('rejects verification with wrong nonce', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);

      const wrongNonceMessage = {
        schema: res.body.attestation.schema,
        recipient: res.body.attestation.recipient,
        expirationTime: 0n,
        revocable: true,
        refUID: ZERO_REF_UID,
        data: res.body.attestation.data,
        value: 0n,
        nonce: BigInt(res.body.delegatedAttestation.nonce + 999), // Wrong nonce
        deadline: BigInt(res.body.delegatedAttestation.deadline),
      };

      const recovered = verifyTypedData(
        EAS_DOMAIN,
        EAS_ATTEST_TYPES,
        wrongNonceMessage,
        res.body.attestation.signature
      );

      expect(recovered.toLowerCase()).not.toBe(TEST_ATTESTER.toLowerCase());
    });
  });
});
