import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { Errors } from './error-handler.js';
import { getRequestTier, getRateLimitKey, TIER_RATE_LIMITS } from './api-key-auth.js';

/**
 * Rate limiter middleware with per-key limits.
 *
 * Rate limits by tier:
 * - public (no key): 100/hour
 * - developer: 1,000/hour
 * - internal: 10,000/hour
 *
 * Keys by API key when present, falls back to IP address.
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window

  // Dynamic limit based on API key tier
  max: (req: Request) => {
    const tier = getRequestTier(req);
    return TIER_RATE_LIMITS[tier];
  },

  // Key by API key or IP
  keyGenerator: (req: Request) => getRateLimitKey(req),

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
