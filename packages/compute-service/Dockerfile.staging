# Build from repo root context (for monorepo workspace support)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/compute-service/package.json ./packages/compute-service/

# Install all dependencies (workspaces need the full install)
RUN npm ci

# Copy source code
COPY packages/compute-service/tsconfig.json ./packages/compute-service/
COPY packages/compute-service/src ./packages/compute-service/src

# Build the compute service
WORKDIR /app/packages/compute-service
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/compute-service/package.json ./packages/compute-service/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@astral/compute-service

# Copy built files
COPY --from=builder /app/packages/compute-service/dist ./packages/compute-service/dist

WORKDIR /app/packages/compute-service

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
