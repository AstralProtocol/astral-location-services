/**
 * Integration tests for API key authentication.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_API_KEYS } from '../../helpers/test-server.js';
import { SF_POINT, NYC_POINT, makeRequest } from '../../fixtures/geometries.js';

const app = createTestApp();

describe('API Key Authentication', () => {
  describe('unauthenticated requests', () => {
    it('allows requests without API key (public tier)', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      // Should succeed (public tier allows access)
      expect(res.status).toBe(200);
      expect(res.body.result).toBeGreaterThan(0);
    });
  });

  describe('authenticated requests', () => {
    it('accepts valid developer API key via X-API-Key header', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .set('X-API-Key', TEST_API_KEYS.developer)
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBeGreaterThan(0);
    });

    it('accepts valid API key via Authorization Bearer header', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .set('Authorization', `Bearer ${TEST_API_KEYS.internal}`)
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(200);
      expect(res.body.result).toBeGreaterThan(0);
    });

    it('rejects invalid API key with 401', async () => {
      const res = await request(app)
        .post('/compute/v0/distance')
        .set('X-API-Key', 'invalid_key_12345')
        .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(401);
      expect(res.body.title).toBe('Unauthorized');
      expect(res.body.detail).toBe('Invalid API key');
    });
  });

  describe('verify endpoints', () => {
    it('allows unauthenticated stamp verification', async () => {
      const res = await request(app)
        .post('/verify/v0/stamp')
        .send({
          locationType: 'decentralized-location-proof',
          location: SF_POINT,
          timestamp: '2024-01-01T00:00:00Z',
          signature: '0x' + '00'.repeat(65),
          publicKey: '0x' + '00'.repeat(33),
        });

      // May fail validation, but should not be 401
      expect(res.status).not.toBe(401);
    });

    it('accepts authenticated stamp verification', async () => {
      const res = await request(app)
        .post('/verify/v0/stamp')
        .set('X-API-Key', TEST_API_KEYS.developer)
        .send({
          locationType: 'decentralized-location-proof',
          location: SF_POINT,
          timestamp: '2024-01-01T00:00:00Z',
          signature: '0x' + '00'.repeat(65),
          publicKey: '0x' + '00'.repeat(33),
        });

      // May fail validation, but should not be 401
      expect(res.status).not.toBe(401);
    });
  });
});
