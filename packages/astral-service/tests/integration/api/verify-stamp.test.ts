/**
 * Integration tests for POST /verify/v0/stamp endpoint.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createVerifyTestApp } from '../../helpers/verify-test-server.js';
import {
  VALID_STAMP,
  STAMP_INVALID_SIGNATURE,
  makeStampRequest,
} from '../../fixtures/verify.js';

const app = createVerifyTestApp();

describe('POST /verify/v0/stamp', () => {
  describe('successful verification', () => {
    it('verifies a valid stamp', async () => {
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send(makeStampRequest(VALID_STAMP));

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.signaturesValid).toBe(true);
      expect(res.body.structureValid).toBe(true);
      expect(res.body.signalsConsistent).toBe(true);
      expect(res.body.details).toBeDefined();
    });
  });

  describe('invalid stamps', () => {
    it('rejects stamp with invalid signature format at validation', async () => {
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send(makeStampRequest(STAMP_INVALID_SIGNATURE));

      // Validation catches invalid hex format before verification
      expect(res.status).toBe(400);
    });

    it('detects stamp with missing signer info as invalid', async () => {
      // Valid hex format but missing signer fields would be caught in verification
      const stampWithBadSigner = {
        ...VALID_STAMP,
        signatures: [
          {
            signer: { scheme: '', value: '' }, // Empty but present
            algorithm: 'secp256k1',
            value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00',
            timestamp: Math.floor(Date.now() / 1000),
          },
        ],
      };
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send(makeStampRequest(stampWithBadSigner));

      // Empty scheme/value fails validation
      expect(res.status).toBe(400);
    });

    it('rejects stamp with missing plugin', async () => {
      const invalidStamp = { ...VALID_STAMP, plugin: '' };
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send(makeStampRequest(invalidStamp));

      expect(res.status).toBe(400);
    });

    it('rejects stamp with invalid lpVersion', async () => {
      const invalidStamp = { ...VALID_STAMP, lpVersion: '1.0' };
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send(makeStampRequest(invalidStamp));

      expect(res.status).toBe(400);
    });
  });

  describe('validation errors', () => {
    it('rejects request with missing stamp', async () => {
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects stamp with missing signatures array', async () => {
      const invalidStamp = { ...VALID_STAMP };
      delete (invalidStamp as Record<string, unknown>).signatures;

      const res = await request(app)
        .post('/verify/v0/stamp')
        .send({ stamp: invalidStamp });

      expect(res.status).toBe(400);
    });
  });

  describe('response format', () => {
    it('returns RFC 7807 problem details on validation error', async () => {
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        type: expect.stringContaining('astral.global/errors'),
        title: expect.any(String),
        status: 400,
        detail: expect.any(String),
        instance: '/verify/v0/stamp',
      });
    });
  });
});
