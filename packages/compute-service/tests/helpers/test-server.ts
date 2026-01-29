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

// Test signer key - DO NOT use in production
// This is a well-known test private key
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
