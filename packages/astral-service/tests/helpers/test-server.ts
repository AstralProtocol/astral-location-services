/**
 * Test server factory for integration tests.
 * Creates an Express app without starting the HTTP server.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import computeRoutes from '../../src/compute/routes/index.js';
import verifyRoutes from '../../src/verify/routes/index.js';
import { errorHandler } from '../../src/core/middleware/error-handler.js';
import { initSigner } from '../../src/core/signing/attestation.js';
import { initPluginRegistry } from '../../src/verify/index.js';
import { apiKeyAuth, initApiKeys } from '../../src/core/middleware/api-key-auth.js';

/**
 * Hardhat/Anvil default account #0 private key.
 *
 * Derived from the standard test mnemonic:
 *   "test test test test test test test test test test test junk"
 *
 * Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *
 * WARNING: This key is publicly known. Never use with real funds.
 * See: https://hardhat.org/hardhat-network/docs/reference#initial-state
 */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/**
 * Test API keys for integration tests.
 */
export const TEST_API_KEYS = {
  developer: 'als_test_dev_key',
  internal: 'als_test_internal_key',
};

/**
 * Create a test Express app with all routes mounted.
 * Does NOT start listening - use with supertest.
 */
export function createTestApp() {
  const app = express();

  // Initialize signer with test key
  initSigner(TEST_PRIVATE_KEY, 84532);

  // Initialize verify plugin registry
  initPluginRegistry();

  // Set up test API keys
  process.env.API_KEYS = JSON.stringify({
    [TEST_API_KEYS.developer]: { tier: 'developer', label: 'Test Developer Key' },
    [TEST_API_KEYS.internal]: { tier: 'internal', label: 'Test Internal Key' },
  });
  initApiKeys();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Mount routes at /compute/v0 with API key auth
  app.use('/compute/v0', apiKeyAuth, computeRoutes);

  // Mount verify routes at /verify/v0 with API key auth
  app.use('/verify/v0', apiKeyAuth, verifyRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
}
