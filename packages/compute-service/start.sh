#!/bin/bash
set -e

# ============================================================================
# Astral Compute Service - Startup Script
# Starts PostgreSQL + PostGIS and the Node.js API in a single container
# ============================================================================

echo "Starting Astral Compute Service..."

# ----------------------------------------------------------------------------
# 1. Initialize and start PostgreSQL (as postgres user)
# ----------------------------------------------------------------------------
export PGDATA=${PGDATA:-/var/lib/postgresql/data}

# Ensure data directory exists and has correct permissions
mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

# Initialize database if not already done
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Creating new PostgreSQL database cluster..."

    su postgres -c "initdb --username=postgres"

    # Configure PostgreSQL for local connections
    echo "host all all 127.0.0.1/32 md5" >> "$PGDATA/pg_hba.conf"
    echo "local all all trust" >> "$PGDATA/pg_hba.conf"
fi

# Start PostgreSQL in the background
echo "Starting PostgreSQL..."
su postgres -c "pg_ctl -D '$PGDATA' -o '-c listen_addresses=localhost' -l /var/log/postgresql/postgresql.log start"

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

cd /app/packages/compute-service
exec node dist/index.js
