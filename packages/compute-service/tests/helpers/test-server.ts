/**
 * Test server factory for integration tests.
 * Creates an Express app without starting the HTTP server.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import computeRoutes from '../../src/routes/index.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { initSigner } from '../../src/signing/attestation.js';

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
 * Create a test Express app with all routes mounted.
 * Does NOT start listening - use with supertest.
 */
export function createTestApp() {
  const app = express();

  // Initialize signer with test key
  initSigner(TEST_PRIVATE_KEY, 84532);

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Mount routes at /compute/v0
  app.use('/compute/v0', computeRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
}
