import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { Errors } from './error-handler.js';
import { extractApiKey, getApiKeyConfig, TIER_RATE_LIMITS, type ApiKeyTier } from './api-key-auth.js';

/**
 * Get the tier for a request based on API key.
 * Returns 'public' if no key or invalid key.
 */
function getRequestTier(req: Request): ApiKeyTier {
  const apiKey = extractApiKey(req);
  if (!apiKey) return 'public';
  
  const config = getApiKeyConfig(apiKey);
  return config?.tier ?? 'public';
}

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
  keyGenerator: (req: Request) => {
    const apiKey = extractApiKey(req);
    if (apiKey) {
      return `key:${apiKey}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
  },
  
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    const tier = getRequestTier(req);
    const limit = TIER_RATE_LIMITS[tier];
    const error = Errors.rateLimited();
    res.status(error.status).json({
      type: error.type,
      title: error.title,
      status: error.status,
      detail: `Rate limit exceeded (${limit} requests/hour for ${tier} tier). Please try again later.`,
    });
  },
});
