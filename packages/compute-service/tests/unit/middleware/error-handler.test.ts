import { describe, it, expect, vi } from 'vitest';
import { ApiError, Errors, errorHandler } from '../../../src/middleware/error-handler.js';
import type { Request, Response, NextFunction } from 'express';

// Create mock request/response
function createMockReq(path = '/compute/v0/distance'): Partial<Request> {
  return { path };
}

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

describe('Error Handler', () => {
  describe('ApiError', () => {
    it('creates error with all properties', () => {
      const error = new ApiError(400, 'https://example.com/error', 'Bad Request', 'Invalid input');
      expect(error.status).toBe(400);
      expect(error.type).toBe('https://example.com/error');
      expect(error.title).toBe('Bad Request');
      expect(error.detail).toBe('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ApiError');
    });
  });

  describe('Errors factories', () => {
    it('badRequest creates 400 error', () => {
      const error = Errors.badRequest('Something went wrong');
      expect(error.status).toBe(400);
      expect(error.type).toBe('https://astral.global/errors/bad-request');
      expect(error.title).toBe('Bad Request');
      expect(error.detail).toBe('Something went wrong');
    });

    it('invalidInput creates 400 error', () => {
      const error = Errors.invalidInput('Invalid geometry');
      expect(error.status).toBe(400);
      expect(error.type).toBe('https://astral.global/errors/invalid-input');
      expect(error.title).toBe('Invalid Input');
      expect(error.detail).toBe('Invalid geometry');
    });

    it('notImplemented creates 501 error', () => {
      const error = Errors.notImplemented('UID resolution');
      expect(error.status).toBe(501);
      expect(error.type).toBe('https://astral.global/errors/not-implemented');
      expect(error.title).toBe('Not Implemented');
      expect(error.detail).toBe('UID resolution is not yet implemented');
    });

    it('internalError creates 500 error', () => {
      const error = Errors.internalError('Database connection failed');
      expect(error.status).toBe(500);
      expect(error.type).toBe('https://astral.global/errors/internal');
      expect(error.title).toBe('Internal Server Error');
    });

    it('databaseError creates 500 error', () => {
      const error = Errors.databaseError('Query failed');
      expect(error.status).toBe(500);
      expect(error.type).toBe('https://astral.global/errors/database');
      expect(error.title).toBe('Database Error');
    });

    it('rateLimited creates 429 error', () => {
      const error = Errors.rateLimited();
      expect(error.status).toBe(429);
      expect(error.type).toBe('https://astral.global/errors/rate-limited');
      expect(error.title).toBe('Rate Limited');
    });
  });

  describe('errorHandler middleware', () => {
    it('formats ApiError as RFC 7807 Problem Details', () => {
      const req = createMockReq('/compute/v0/distance');
      const res = createMockRes();
      const next = vi.fn();
      const error = Errors.invalidInput('Invalid coordinates');

      // Suppress console.error during test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, req as Request, res as Response, next as NextFunction);

      expect(res._status).toBe(400);
      expect(res._json).toEqual({
        type: 'https://astral.global/errors/invalid-input',
        title: 'Invalid Input',
        status: 400,
        detail: 'Invalid coordinates',
        instance: '/compute/v0/distance',
      });

      consoleSpy.mockRestore();
    });

    it('includes instance path in error response', () => {
      const req = createMockReq('/compute/v0/area');
      const res = createMockRes();
      const next = vi.fn();
      const error = Errors.badRequest('Missing geometry');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, req as Request, res as Response, next as NextFunction);

      expect((res._json as { instance: string }).instance).toBe('/compute/v0/area');

      consoleSpy.mockRestore();
    });

    it('handles generic Error as 500', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      const error = new Error('Something unexpected');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, req as Request, res as Response, next as NextFunction);

      expect(res._status).toBe(500);
      expect((res._json as { type: string }).type).toBe('https://astral.global/errors/internal');

      consoleSpy.mockRestore();
    });

    it('handles ZodError as 400 validation error', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      const error = new Error('Validation failed');
      error.name = 'ZodError';

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, req as Request, res as Response, next as NextFunction);

      expect(res._status).toBe(400);
      expect((res._json as { type: string }).type).toBe('https://astral.global/errors/validation');
      expect((res._json as { title: string }).title).toBe('Validation Error');

      consoleSpy.mockRestore();
    });

    it('handles database errors (errors with code property)', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      const error = new Error('Connection refused') as Error & { code: string };
      error.code = 'ECONNREFUSED';

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, req as Request, res as Response, next as NextFunction);

      expect(res._status).toBe(500);
      expect((res._json as { type: string }).type).toBe('https://astral.global/errors/database');

      consoleSpy.mockRestore();
    });
  });
});
