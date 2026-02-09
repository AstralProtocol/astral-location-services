import type { Request, Response, NextFunction } from 'express';
import { Errors } from './error-handler.js';

/**
 * API Key tiers with associated rate limits.
 */
export type ApiKeyTier = 'public' | 'developer' | 'internal';

/**
 * API Key configuration.
 */
export interface ApiKeyConfig {
  tier: ApiKeyTier;
  label: string;
}

/**
 * Rate limits per tier (requests per hour).
 */
export const TIER_RATE_LIMITS: Record<ApiKeyTier, number> = {
  public: 100,      // Unauthenticated/anonymous
  developer: 1000,  // Integrators, SDK usage
  internal: 10000,  // E2E tests, playground, CI
};

/**
 * Parsed API keys from environment variable.
 * Format: JSON object mapping key -> { tier, label }
 * 
 * Example env var:
 * API_KEYS={"als_dev_abc123":{"tier":"developer","label":"SDK tests"},"als_e2e_xyz":{"tier":"internal","label":"E2E suite"}}
 */
let apiKeys: Map<string, ApiKeyConfig> = new Map();

/**
 * Initialize API keys from environment variable.
 * Call this at startup.
 */
export function initApiKeys(): void {
  const keysJson = process.env.API_KEYS;
  
  if (!keysJson) {
    console.log('API_KEYS not configured. All requests will use public tier rate limits.');
    return;
  }

  try {
    const parsed = JSON.parse(keysJson) as Record<string, ApiKeyConfig>;
    apiKeys = new Map(Object.entries(parsed));
    console.log(`Loaded ${apiKeys.size} API key(s)`);
  } catch (err) {
    console.error('Failed to parse API_KEYS environment variable:', err);
    console.warn('All requests will use public tier rate limits.');
  }
}

/**
 * Look up an API key and return its configuration.
 * Returns undefined if key is not found.
 */
export function getApiKeyConfig(key: string): ApiKeyConfig | undefined {
  return apiKeys.get(key);
}

/**
 * Get the tier for a request based on API key.
 * Returns 'public' if no key or invalid key.
 */
export function getRequestTier(req: Request): ApiKeyTier {
  const apiKey = extractApiKey(req);
  if (!apiKey) return 'public';
  
  const config = getApiKeyConfig(apiKey);
  return config?.tier ?? 'public';
}

/**
 * Extract API key from request headers.
 * Supports both X-API-Key header and Authorization: Bearer <key>.
 */
export function extractApiKey(req: Request): string | undefined {
  // Check X-API-Key header first
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.length > 0) {
    return xApiKey;
  }

  // Check Authorization: Bearer <key>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

/**
 * Middleware that validates API key if provided.
 * 
 * Behavior:
 * - No API key: Request proceeds with 'public' tier (lowest rate limit)
 * - Valid API key: Request proceeds with configured tier
 * - Invalid API key: Returns 401 Unauthorized
 * 
 * This middleware attaches the tier to req for use by rate limiter.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    // No key provided - allow with public tier
    (req as AuthenticatedRequest).apiKeyTier = 'public';
    next();
    return;
  }

  const config = getApiKeyConfig(apiKey);
  
  if (!config) {
    // Invalid key provided - reject
    const error = Errors.unauthorized('Invalid API key');
    res.status(error.status).json({
      type: error.type,
      title: error.title,
      status: error.status,
      detail: error.detail,
    });
    return;
  }

  // Valid key - attach tier to request
  (req as AuthenticatedRequest).apiKeyTier = config.tier;
  (req as AuthenticatedRequest).apiKeyLabel = config.label;
  next();
}

/**
 * Strict API key middleware that requires authentication.
 * Use this for endpoints that should never be publicly accessible.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    const error = Errors.unauthorized('API key required');
    res.status(error.status).json({
      type: error.type,
      title: error.title,
      status: error.status,
      detail: error.detail,
    });
    return;
  }

  // Delegate to standard auth middleware
  apiKeyAuth(req, res, next);
}

/**
 * Extended Request type with API key information.
 */
export interface AuthenticatedRequest extends Request {
  apiKeyTier?: ApiKeyTier;
  apiKeyLabel?: string;
}

/**
 * Get rate limit for a request based on its tier.
 */
export function getRateLimitForRequest(req: Request): number {
  const tier = (req as AuthenticatedRequest).apiKeyTier ?? 'public';
  return TIER_RATE_LIMITS[tier];
}

/**
 * Get a unique key for rate limiting.
 * Uses API key if present, falls back to IP address.
 */
export function getRateLimitKey(req: Request): string {
  const apiKey = extractApiKey(req);
  if (apiKey) {
    return `key:${apiKey}`;
  }
  // Fall back to IP address
  return `ip:${req.ip ?? 'unknown'}`;
}
