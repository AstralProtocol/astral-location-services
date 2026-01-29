import rateLimit from 'express-rate-limit';
import { Errors } from './error-handler.js';

/**
 * Rate limiter middleware.
 * Limits requests by IP address.
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 100, // 100 requests per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const error = Errors.rateLimited();
    res.status(error.status).json({
      type: error.type,
      title: error.title,
      status: error.status,
      detail: error.detail,
    });
  },
});
