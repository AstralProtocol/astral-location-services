import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  apiKeyAuth,
  requireApiKey,
  extractApiKey,
  getApiKeyConfig,
  getRequestTier,
  getRateLimitKey,
  initApiKeys,
  TIER_RATE_LIMITS,
  type AuthenticatedRequest,
} from '../../../src/core/middleware/api-key-auth.js';

// Mock request factory
function createMockReq(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers,
    ip: '127.0.0.1',
  };
}

// Mock response factory
function createMockRes(): Partial<Response> & { _status?: number; _json?: unknown } {
  const res: Partial<Response> & { _status?: number; _json?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res._status = code;
    return res as Response;
  });
  res.json = vi.fn((data: unknown) => {
    res._json = data;
    return res as Response;
  });
  return res;
}

describe('API Key Authentication', () => {
  const originalEnv = process.env.API_KEYS;

  beforeEach(() => {
    // Set up test API keys
    process.env.API_KEYS = JSON.stringify({
      'als_dev_test123': { tier: 'developer', label: 'Test Developer Key' },
      'als_internal_xyz': { tier: 'internal', label: 'Internal Test Key' },
    });
    initApiKeys();
  });

  afterEach(() => {
    process.env.API_KEYS = originalEnv;
  });

  describe('extractApiKey', () => {
    it('extracts key from X-API-Key header', () => {
      const req = createMockReq({ 'x-api-key': 'als_dev_test123' });
      expect(extractApiKey(req as Request)).toBe('als_dev_test123');
    });

    it('extracts key from Authorization Bearer header', () => {
      const req = createMockReq({ authorization: 'Bearer als_dev_test123' });
      expect(extractApiKey(req as Request)).toBe('als_dev_test123');
    });

    it('prefers X-API-Key over Authorization header', () => {
      const req = createMockReq({
        'x-api-key': 'als_dev_test123',
        authorization: 'Bearer other_key',
      });
      expect(extractApiKey(req as Request)).toBe('als_dev_test123');
    });

    it('returns undefined when no key present', () => {
      const req = createMockReq({});
      expect(extractApiKey(req as Request)).toBeUndefined();
    });

    it('returns undefined for empty X-API-Key', () => {
      const req = createMockReq({ 'x-api-key': '' });
      expect(extractApiKey(req as Request)).toBeUndefined();
    });

    it('returns undefined for malformed Authorization header', () => {
      const req = createMockReq({ authorization: 'Basic abc123' });
      expect(extractApiKey(req as Request)).toBeUndefined();
    });
  });

  describe('getApiKeyConfig', () => {
    it('returns config for valid key', () => {
      const config = getApiKeyConfig('als_dev_test123');
      expect(config).toEqual({ tier: 'developer', label: 'Test Developer Key' });
    });

    it('returns undefined for unknown key', () => {
      expect(getApiKeyConfig('unknown_key')).toBeUndefined();
    });
  });

  describe('getRequestTier', () => {
    it('returns developer tier for developer key', () => {
      const req = createMockReq({ 'x-api-key': 'als_dev_test123' });
      expect(getRequestTier(req as Request)).toBe('developer');
    });

    it('returns internal tier for internal key', () => {
      const req = createMockReq({ 'x-api-key': 'als_internal_xyz' });
      expect(getRequestTier(req as Request)).toBe('internal');
    });

    it('returns public tier for no key', () => {
      const req = createMockReq({});
      expect(getRequestTier(req as Request)).toBe('public');
    });

    it('returns public tier for invalid key', () => {
      const req = createMockReq({ 'x-api-key': 'invalid_key' });
      expect(getRequestTier(req as Request)).toBe('public');
    });
  });

  describe('getRateLimitKey', () => {
    it('uses API key when present', () => {
      const req = createMockReq({ 'x-api-key': 'als_dev_test123' });
      expect(getRateLimitKey(req as Request)).toBe('key:als_dev_test123');
    });

    it('falls back to IP when no key', () => {
      const req = createMockReq({});
      expect(getRateLimitKey(req as Request)).toBe('ip:127.0.0.1');
    });
  });

  describe('TIER_RATE_LIMITS', () => {
    it('has correct limits', () => {
      expect(TIER_RATE_LIMITS.public).toBe(100);
      expect(TIER_RATE_LIMITS.developer).toBe(1000);
      expect(TIER_RATE_LIMITS.internal).toBe(10000);
    });
  });

  describe('apiKeyAuth middleware', () => {
    it('allows requests without API key (public tier)', () => {
      const req = createMockReq({}) as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      apiKeyAuth(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(req.apiKeyTier).toBe('public');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows requests with valid developer key', () => {
      const req = createMockReq({ 'x-api-key': 'als_dev_test123' }) as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      apiKeyAuth(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(req.apiKeyTier).toBe('developer');
      expect(req.apiKeyLabel).toBe('Test Developer Key');
    });

    it('allows requests with valid internal key', () => {
      const req = createMockReq({ 'x-api-key': 'als_internal_xyz' }) as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      apiKeyAuth(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(req.apiKeyTier).toBe('internal');
    });

    it('rejects requests with invalid API key', () => {
      const req = createMockReq({ 'x-api-key': 'invalid_key' });
      const res = createMockRes();
      const next = vi.fn();

      apiKeyAuth(req as Request, res as Response, next as NextFunction);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json).toMatchObject({
        status: 401,
        title: 'Unauthorized',
        detail: 'Invalid API key',
      });
    });
  });

  describe('requireApiKey middleware', () => {
    it('rejects requests without API key', () => {
      const req = createMockReq({});
      const res = createMockRes();
      const next = vi.fn();

      requireApiKey(req as Request, res as Response, next as NextFunction);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json).toMatchObject({
        status: 401,
        title: 'Unauthorized',
        detail: 'API key required',
      });
    });

    it('allows requests with valid API key', () => {
      const req = createMockReq({ 'x-api-key': 'als_dev_test123' }) as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      requireApiKey(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(req.apiKeyTier).toBe('developer');
    });

    it('rejects requests with invalid API key', () => {
      const req = createMockReq({ 'x-api-key': 'invalid_key' });
      const res = createMockRes();
      const next = vi.fn();

      requireApiKey(req as Request, res as Response, next as NextFunction);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('initApiKeys', () => {
    it('handles missing API_KEYS env var', () => {
      delete process.env.API_KEYS;
      // Should not throw
      expect(() => initApiKeys()).not.toThrow();
    });

    it('handles invalid JSON in API_KEYS', () => {
      process.env.API_KEYS = 'not valid json';
      // Should not throw, just log error
      expect(() => initApiKeys()).not.toThrow();
    });
  });
});
