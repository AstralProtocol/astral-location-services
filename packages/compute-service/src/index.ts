import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { checkConnection } from './db/pool.js';
import { initSigner, getSignerAddress } from './signing/attestation.js';
import computeRoutes from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimiter } from './middleware/rate-limit.js';

const app = express();
const PORT = process.env.PORT || 3000;

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
    },
  });
});

// Compute routes
app.use('/compute/v0', computeRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Startup
async function start() {
  // Initialize signer if private key is provided
  const signerKey = process.env.SIGNER_PRIVATE_KEY;
  if (signerKey) {
    const chainId = parseInt(process.env.CHAIN_ID || '84532', 10);
    initSigner(signerKey, chainId);
    console.log('Signer address:', getSignerAddress());
  } else {
    console.warn('WARNING: SIGNER_PRIVATE_KEY not set. Attestation signing will fail.');
  }

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
