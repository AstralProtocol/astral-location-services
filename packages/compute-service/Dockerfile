# EigenCloud Production Dockerfile
# Self-contained with PostGIS for verifiable computation in TEE
#
# Build from repo root: docker build -f packages/compute-service/Dockerfile .

# ============================================================================
# Stage 1: Build TypeScript
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/compute-service/package.json ./packages/compute-service/

# Install all dependencies
RUN npm ci

# Copy source and build
COPY packages/compute-service/tsconfig.json ./packages/compute-service/
COPY packages/compute-service/src ./packages/compute-service/src

WORKDIR /app/packages/compute-service
RUN npm run build

# ============================================================================
# Stage 2: Production with PostGIS
# ============================================================================
FROM postgis/postgis:15-3.3

# Install Node.js 20
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy root workspace files for npm
COPY package.json package-lock.json ./
COPY packages/compute-service/package.json ./packages/compute-service/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@astral/compute-service

# Copy built application
COPY --from=builder /app/packages/compute-service/dist ./packages/compute-service/dist

# Copy init script for PostGIS
COPY packages/compute-service/init.sql /docker-entrypoint-initdb.d/

# Copy startup script
COPY packages/compute-service/start.sh /start.sh
RUN chmod +x /start.sh

# Create log directory for PostgreSQL
RUN mkdir -p /var/log/postgresql && chown postgres:postgres /var/log/postgresql

# Environment defaults
ENV NODE_ENV=production
ENV POSTGRES_USER=astral
ENV POSTGRES_PASSWORD=astral
ENV POSTGRES_DB=astral
ENV DATABASE_URL=postgresql://astral:astral@localhost:5432/astral
ENV PORT=3000

# Expose the API port (PostgreSQL stays internal)
EXPOSE 3000

# Health check against the Node.js API
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start both PostgreSQL and Node.js
CMD ["/start.sh"]
