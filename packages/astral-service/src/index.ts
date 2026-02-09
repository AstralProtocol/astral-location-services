import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { checkConnection } from './compute/db/pool.js';
import { initSigner, initSignerFromMnemonic, getSignerAddress, syncNonceFromEAS } from './core/signing/attestation.js';
import { initSchemaConfig } from './core/config/schemas.js';
import computeRoutes from './compute/routes/index.js';
import verifyRoutes from './verify/routes/index.js';
import { initPluginRegistry } from './verify/index.js';
import { errorHandler } from './core/middleware/error-handler.js';
import { rateLimiter } from './core/middleware/rate-limit.js';
import { apiKeyAuth, initApiKeys } from './core/middleware/api-key-auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for deployments behind reverse proxies (Railway, Heroku, etc.)
// This is required for express-rate-limit to correctly identify client IPs
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
}));

// Body parsing with size limit
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter);

// Health check endpoint
app.get('/health', async (_req, res) => {
  const dbHealthy = await checkConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// API info endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Astral Location Services',
    version: '0.1.0',
    description: 'Verifiable geospatial computation service for Ethereum',
    endpoints: {
      '/compute/v0/distance': 'POST - Compute distance between two geometries',
      '/compute/v0/area': 'POST - Compute area of a polygon',
      '/compute/v0/length': 'POST - Compute length of a line',
      '/compute/v0/contains': 'POST - Check if geometry A contains geometry B',
      '/compute/v0/within': 'POST - Check if point is within radius of target',
      '/compute/v0/intersects': 'POST - Check if two geometries intersect',
      '/verify/v0/stamp': 'POST - Verify a location stamp\'s internal validity',
      '/verify/v0/proof': 'POST - Verify a location proof and return credibility assessment',
      '/verify/v0/plugins': 'GET - List available verification plugins',
    },
  });
});

// Compute routes (with API key auth)
app.use('/compute/v0', apiKeyAuth, computeRoutes);

// Verify routes (with API key auth)
app.use('/verify/v0', apiKeyAuth, verifyRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Startup
async function start() {
  // Initialize API keys from environment
  initApiKeys();

  // Initialize signer - MNEMONIC (production/TEE) takes precedence over SIGNER_PRIVATE_KEY (local/staging)
  const mnemonic = process.env.MNEMONIC;
  const signerKey = process.env.SIGNER_PRIVATE_KEY;
  const chainId = parseInt(process.env.CHAIN_ID || '84532', 10);

  if (mnemonic) {
    // Production mode: EigenCompute TEE with encrypted mnemonic
    initSignerFromMnemonic(mnemonic, chainId);
    console.log('Mode: Production (TEE)');
    console.log('Signer address:', getSignerAddress());
    await syncNonceFromEAS();
  } else if (signerKey) {
    // Local/Staging mode: Direct private key
    initSigner(signerKey, chainId);
    console.log('Mode: Development/Staging');
    console.log('Signer address:', getSignerAddress());
    await syncNonceFromEAS();
  } else {
    console.warn('WARNING: Neither MNEMONIC nor SIGNER_PRIVATE_KEY set. Attestation signing will fail.');
  }

  // Initialize default schema UIDs for the configured chain
  initSchemaConfig(chainId);

  // Initialize verification plugin registry
  initPluginRegistry();

  // Check database connection
  const dbConnected = await checkConnection();
  if (!dbConnected) {
    console.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Astral Compute Service listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
