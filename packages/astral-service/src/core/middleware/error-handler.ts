import type { Request, Response, NextFunction } from 'express';
import type { ProblemDetails } from '../types/index.js';

/**
 * Custom error class with HTTP status and problem details.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public type: string,
    public title: string,
    public detail: string
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

/**
 * Common error factories.
 */
export const Errors = {
  badRequest: (detail: string) =>
    new ApiError(400, 'https://astral.global/errors/bad-request', 'Bad Request', detail),

  invalidInput: (detail: string) =>
    new ApiError(400, 'https://astral.global/errors/invalid-input', 'Invalid Input', detail),

  notImplemented: (feature: string) =>
    new ApiError(501, 'https://astral.global/errors/not-implemented', 'Not Implemented', `${feature} is not yet implemented`),

  internalError: (detail: string) =>
    new ApiError(500, 'https://astral.global/errors/internal', 'Internal Server Error', detail),

  databaseError: (detail: string) =>
    new ApiError(500, 'https://astral.global/errors/database', 'Database Error', detail),

  rateLimited: () =>
    new ApiError(429, 'https://astral.global/errors/rate-limited', 'Rate Limited', 'Too many requests. Please try again later.'),

  unauthorized: (detail: string) =>
    new ApiError(401, 'https://astral.global/errors/unauthorized', 'Unauthorized', detail),

  forbidden: (detail: string) =>
    new ApiError(403, 'https://astral.global/errors/forbidden', 'Forbidden', detail),
};

/**
 * Express error handling middleware.
 * Formats errors according to RFC 7807 Problem Details.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  if (err instanceof ApiError) {
    const problem: ProblemDetails = {
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance: req.path,
    };

    res.status(err.status).json(problem);
    return;
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const problem: ProblemDetails = {
      type: 'https://astral.global/errors/validation',
      title: 'Validation Error',
      status: 400,
      detail: err.message,
      instance: req.path,
    };

    res.status(400).json(problem);
    return;
  }

  // Handle database errors
  if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
    const pgError = err as { code: string };
    const problem: ProblemDetails = {
      type: 'https://astral.global/errors/database',
      title: 'Database Error',
      status: 500,
      detail: `Database error: ${pgError.code}`,
      instance: req.path,
    };

    res.status(500).json(problem);
    return;
  }

  // Generic error
  const problem: ProblemDetails = {
    type: 'https://astral.global/errors/internal',
    title: 'Internal Server Error',
    status: 500,
    detail: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    instance: req.path,
  };

  res.status(500).json(problem);
}
