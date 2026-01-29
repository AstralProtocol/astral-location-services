import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostGIS database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function checkConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT PostGIS_Version()');
    console.log('PostGIS version:', result.rows[0].postgis_version);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
