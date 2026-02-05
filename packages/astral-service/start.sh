#!/bin/bash
set -e

# ============================================================================
# Astral Compute Service - Startup Script
# Starts PostgreSQL + PostGIS and the Node.js API in a single container
# ============================================================================

echo "Starting Astral Compute Service..."
echo "Environment: NODE_ENV=$NODE_ENV"

# ----------------------------------------------------------------------------
# 1. Initialize and start PostgreSQL (as postgres user)
# ----------------------------------------------------------------------------
export PGDATA=${PGDATA:-/var/lib/postgresql/data}
export PGLOG=/var/log/postgresql/postgresql.log

# Ensure directories exist and have correct permissions
mkdir -p "$PGDATA"
mkdir -p /var/log/postgresql
mkdir -p /var/run/postgresql
chown -R postgres:postgres "$PGDATA"
chown -R postgres:postgres /var/log/postgresql
chown -R postgres:postgres /var/run/postgresql
chmod 700 "$PGDATA"

# Initialize database if not already done
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Creating new PostgreSQL database cluster..."

    su postgres -c "initdb --username=postgres"

    # Configure PostgreSQL for local connections
    echo "host all all 127.0.0.1/32 md5" >> "$PGDATA/pg_hba.conf"
    echo "local all all trust" >> "$PGDATA/pg_hba.conf"

    # Configure PostgreSQL for low memory / TEE environment
    # These settings reduce shared memory requirements
    cat >> "$PGDATA/postgresql.conf" << 'PGCONF'
# TEE-optimized settings (low shared memory)
shared_buffers = 32MB
work_mem = 4MB
maintenance_work_mem = 32MB
effective_cache_size = 128MB
max_connections = 20
dynamic_shared_memory_type = posix
# Disable features we don't need
wal_level = minimal
max_wal_senders = 0
fsync = off
synchronous_commit = off
full_page_writes = off
PGCONF
fi

# Start PostgreSQL in the background with longer timeout
echo "Starting PostgreSQL..."
echo "PGDATA: $PGDATA"
echo "Log file: $PGLOG"

# Start postgres directly (not via pg_ctl) for better error visibility
su postgres -c "pg_ctl -D '$PGDATA' -l '$PGLOG' -w -t 60 start -o '-c listen_addresses=localhost'" || {
    echo "PostgreSQL failed to start. Log output:"
    cat "$PGLOG" 2>/dev/null || echo "No log file found"
    exit 1
}

# ----------------------------------------------------------------------------
# 2. Wait for PostgreSQL and set up database
# ----------------------------------------------------------------------------
echo "Waiting for PostgreSQL to be ready..."
until su postgres -c "pg_isready -h localhost"; do
    sleep 1
done

# Create user and database
echo "Setting up database..."
su postgres -c "psql -h localhost -c \"ALTER USER postgres PASSWORD '$POSTGRES_PASSWORD';\"" 2>/dev/null || true
su postgres -c "psql -h localhost -c \"CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';\"" 2>/dev/null || true
su postgres -c "psql -h localhost -tc \"SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'\"" | grep -q 1 || \
    su postgres -c "psql -h localhost -c \"CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;\""

# Enable PostGIS extension
su postgres -c "psql -h localhost -d $POSTGRES_DB -c 'CREATE EXTENSION IF NOT EXISTS postgis;'"

echo "PostGIS version: $(su postgres -c "psql -h localhost -d $POSTGRES_DB -t -c 'SELECT PostGIS_Version();'")"

# ----------------------------------------------------------------------------
# 3. Start Node.js application
# ----------------------------------------------------------------------------
echo "Starting Node.js application on port $PORT..."

cd /app/packages/astral-service
exec node dist/index.js
