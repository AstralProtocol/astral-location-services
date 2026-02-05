# Deployment Strategy

This document outlines the deployment strategy for Astral Location Services across different environments.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Deployment Environments                       │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Development   │    Staging      │        Production           │
│   (Local)       │    (Cloud Run)  │        (EigenCloud)         │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ localhost:3000  │ api-staging.    │ api.astral.global           │
│                 │ astral.global   │                             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ No TEE          │ No TEE          │ TEE (EigenCompute)          │
│ Local PostGIS   │ Cloud SQL       │ In-container PostGIS        │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ Test keys       │ Staging keys    │ Production keys             │
│ Any chain       │ Base Sepolia    │ Base Sepolia → Base Mainnet │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

---

## Environment Configurations

### 1. Development (Local)

**Purpose:** Developer iteration, debugging, testing

```bash
# Start dev environment
npm run dev:db    # PostGIS on port 5432
npm run dev       # Service on port 3000

# Or full stack
npm run docker:up
```

**Configuration:**
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://astral:astral@localhost:5432/astral
SIGNER_PRIVATE_KEY=<dev-test-key>
CHAIN_ID=84532
```

---

### 2. Staging (Non-TEE)

**Purpose:** Integration testing, demos, partner onboarding, CI/CD validation

**Infrastructure:**
- **Compute:** Google Cloud Run (or Vercel Edge Functions)
- **Database:** Cloud SQL PostgreSQL + PostGIS
- **Domain:** `api-staging.astral.global`

**Why Cloud Run for staging:**
- Fast deployments (~30s)
- Auto-scaling to zero (cost efficient)
- Same container as production
- No TEE overhead for rapid iteration
- Easy debugging and logging

**Configuration:**
```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://astral:<password>@/astral?host=/cloudsql/<project>:<region>:<instance>
SIGNER_PRIVATE_KEY=<staging-key>
CHAIN_ID=84532
EAS_CONTRACT_ADDRESS=0x4200000000000000000000000000000000000021
ALLOWED_ORIGINS=https://staging.astral.global,http://localhost:3000
```

**Staging-specific considerations:**
- Uses **different signer key** than production
- Same chain (Base Sepolia) as initial production
- Attestations are real but clearly marked as staging
- Rate limits can be more permissive for testing

---

### 3. Production (EigenCloud TEE)

**Purpose:** Verifiable computation with hardware attestation

**Infrastructure:**
- **Compute:** EigenCloud (TEE environment)
- **Database:** In-container PostGIS (required for verifiability)
- **Domain:** `api.astral.global`

**Configuration:**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://astral:astral@db:5432/astral
SIGNER_PRIVATE_KEY=<production-key>
CHAIN_ID=84532
EAS_CONTRACT_ADDRESS=0x4200000000000000000000000000000000000021
ALLOWED_ORIGINS=https://astral.global,https://app.astral.global
```

---

## DNS Configuration (Cloudflare)

### Domain Structure

```
astral.global
├── api.astral.global          → EigenCloud (Production)
├── api-staging.astral.global  → Cloud Run (Staging)
├── app.astral.global          → Vercel (Frontend/Demo)
└── docs.astral.global         → Mintlify (Documentation)
```

### Cloudflare DNS Records

```
# Production API (EigenCloud)
Type: CNAME
Name: api
Target: <eigencloud-endpoint>.eigencloud.io
Proxy: OFF (DNS only - required for TEE attestation)
TTL: Auto

# Staging API (Cloud Run)
Type: CNAME
Name: api-staging
Target: astral-staging-<hash>-uc.a.run.app
Proxy: ON (orange cloud - Cloudflare CDN)
TTL: Auto

# Frontend (Vercel)
Type: CNAME
Name: app
Target: cname.vercel-dns.com
Proxy: OFF (Vercel handles SSL)
TTL: Auto

# Documentation
Type: CNAME
Name: docs
Target: https://astral-6ef288be.mintlify.app
Proxy: ON
TTL: Auto
```

### SSL/TLS Configuration

```yaml
Cloudflare SSL Settings:
  SSL Mode: Full (strict)
  Always Use HTTPS: ON
  Automatic HTTPS Rewrites: ON
  Min TLS Version: 1.2

# For api.astral.global (EigenCloud):
# Use "DNS only" (gray cloud) to let EigenCloud handle SSL
# This is required for TEE attestation verification

# For staging:
# Use Cloudflare proxy (orange cloud) for additional protection
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ═══════════════════════════════════════════════════════════════
  # QUALITY GATES
  # ═══════════════════════════════════════════════════════════════

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_USER: astral
          POSTGRES_PASSWORD: astral
          POSTGRES_DB: astral_test
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
        ports:
          - 5433:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://astral:astral@localhost:5433/astral_test

  # ═══════════════════════════════════════════════════════════════
  # BUILD
  # ═══════════════════════════════════════════════════════════════

  build:
    needs: [lint, test-unit, test-integration]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=ref,event=pr
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: ./packages/astral-service
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64

  # ═══════════════════════════════════════════════════════════════
  # DEPLOY STAGING (Cloud Run)
  # ═══════════════════════════════════════════════════════════════

  deploy-staging:
    needs: [build]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy astral-staging \
            --image ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --region us-central1 \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars "NODE_ENV=production" \
            --set-env-vars "CHAIN_ID=84532" \
            --set-secrets "DATABASE_URL=astral-staging-db-url:latest" \
            --set-secrets "SIGNER_PRIVATE_KEY=astral-staging-signer:latest" \
            --min-instances 0 \
            --max-instances 10 \
            --memory 512Mi \
            --cpu 1 \
            --concurrency 80 \
            --timeout 60

      - name: Verify deployment
        run: |
          STAGING_URL=$(gcloud run services describe astral-staging --region us-central1 --format 'value(status.url)')
          curl -f "${STAGING_URL}/health" || exit 1

  # ═══════════════════════════════════════════════════════════════
  # DEPLOY PRODUCTION (EigenCloud)
  # ═══════════════════════════════════════════════════════════════

  deploy-production:
    needs: [deploy-staging]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      # EigenCloud deployment
      # Note: Update these commands based on actual EigenCloud CLI
      - name: Install EigenCloud CLI
        run: |
          curl -fsSL https://cli.eigencloud.io/install.sh | sh
          echo "$HOME/.eigencloud/bin" >> $GITHUB_PATH

      - name: Deploy to EigenCloud
        env:
          EIGENCLOUD_API_KEY: ${{ secrets.EIGENCLOUD_API_KEY }}
        run: |
          eigencloud deploy \
            --image ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --name astral-compute \
            --env NODE_ENV=production \
            --env CHAIN_ID=84532 \
            --secret SIGNER_PRIVATE_KEY \
            --secret DATABASE_URL \
            --port 3000 \
            --health-check /health

      - name: Verify production
        run: |
          sleep 30  # Wait for deployment to stabilize
          curl -f "https://api.astral.global/health" || exit 1
```

### Environment Secrets Configuration

**GitHub Settings → Secrets and Variables → Actions:**

```yaml
# Repository Secrets (shared)
GCP_SA_KEY: <service account JSON for Cloud Run>
EIGENCLOUD_API_KEY: <EigenCloud API key>

# Environment: staging
STAGING_SIGNER_PRIVATE_KEY: <staging wallet private key>
STAGING_DATABASE_URL: <Cloud SQL connection string>

# Environment: production
PRODUCTION_SIGNER_PRIVATE_KEY: <production wallet private key>
# Note: Production DATABASE_URL is internal to EigenCloud container
```

---

## Staging Infrastructure Setup (Cloud Run + Cloud SQL)

### One-time GCP Setup

```bash
# 1. Create project (if needed)
gcloud projects create astral-staging --name="Astral Staging"
gcloud config set project astral-staging

# 2. Enable APIs
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com

# 3. Create Cloud SQL instance with PostGIS
gcloud sql instances create astral-staging-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=10GB

# 4. Set database password
gcloud sql users set-password postgres \
  --instance=astral-staging-db \
  --password=<secure-password>

# 5. Create database
gcloud sql databases create astral --instance=astral-staging-db

# 6. Enable PostGIS (connect via Cloud SQL proxy first)
# Run in psql: CREATE EXTENSION IF NOT EXISTS postgis;

# 7. Create secrets
echo -n "postgresql://postgres:<password>@/astral?host=/cloudsql/astral-staging:us-central1:astral-staging-db" | \
  gcloud secrets create astral-staging-db-url --data-file=-

echo -n "<staging-private-key>" | \
  gcloud secrets create astral-staging-signer --data-file=-

# 8. Create service account for CI/CD
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

gcloud projects add-iam-policy-binding astral-staging \
  --member="serviceAccount:github-actions@astral-staging.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding astral-staging \
  --member="serviceAccount:github-actions@astral-staging.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 9. Create service account key for GitHub
gcloud iam service-accounts keys create ~/github-actions-key.json \
  --iam-account=github-actions@astral-staging.iam.gserviceaccount.com
```

### Alternative: Vercel Edge Functions (Simpler Staging)

If you prefer staying in the Vercel ecosystem for staging:

```typescript
// packages/astral-service/api/index.ts (Vercel serverless)
import { handle } from '../src/vercel-adapter';
export default handle;
```

**Limitations:**
- No persistent PostGIS (would need external DB like Neon, Supabase)
- Cold start latency
- Different runtime characteristics than production

**Recommendation:** Cloud Run is closer to production behavior and supports the full container.

---

## EigenCloud Production Setup

### Prerequisites

1. **EigenCloud Account:** Sign up at eigencloud.io
2. **API Key:** Generate from EigenCloud dashboard
3. **Docker Image:** Built and pushed to GHCR

### Deployment Steps

```bash
# 1. Install EigenCloud CLI
curl -fsSL https://cli.eigencloud.io/install.sh | sh

# 2. Authenticate
eigencloud auth login

# 3. Create deployment configuration
cat > eigencloud.yaml << EOF
name: astral-compute
image: ghcr.io/astral-global/astral-location-services:latest
port: 3000
healthCheck:
  path: /health
  interval: 30s
  timeout: 10s
env:
  NODE_ENV: production
  CHAIN_ID: "84532"
secrets:
  - SIGNER_PRIVATE_KEY
resources:
  cpu: 1
  memory: 2Gi
EOF

# 4. Deploy
eigencloud deploy -f eigencloud.yaml

# 5. Get endpoint
eigencloud service describe astral-compute
```

### EigenCloud Secrets Management

```bash
# Set production secrets in EigenCloud
eigencloud secret set SIGNER_PRIVATE_KEY --value "<production-key>"

# The DATABASE_URL is internal to the container (docker-compose handles it)
# No external database connection needed in production
```

---

## Key Management

### Wallet Setup

```bash
# Generate keys for each environment
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"

# Store securely:
# - Development: .env file (gitignored)
# - Staging: GCP Secret Manager
# - Production: EigenCloud secrets
```

### Key Rotation Procedure

1. Generate new wallet
2. Update resolver contracts with new signer address (multisig)
3. Update secrets in staging/production
4. Redeploy services
5. Verify attestation signing works
6. Revoke old key access

---

## Monitoring & Observability

### Health Checks

All environments expose `/health`:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "signer": "configured"
}
```

### Logging

**Staging (Cloud Run):**
- Cloud Logging automatically captures stdout/stderr
- View in GCP Console or `gcloud logging read`

**Production (EigenCloud):**
- Check EigenCloud dashboard for logs
- Consider adding structured logging output

### Alerting Recommendations

```yaml
# PagerDuty/Opsgenie integration
Alerts:
  - name: API Health Check Failed
    condition: /health returns non-200 for 2+ minutes
    severity: critical

  - name: High Error Rate
    condition: 5xx errors > 5% of requests over 5 minutes
    severity: high

  - name: High Latency
    condition: p95 latency > 5s over 5 minutes
    severity: medium
```

---

## Deployment Checklist

### Before First Staging Deploy

- [ ] GCP project created and APIs enabled
- [ ] Cloud SQL instance running with PostGIS
- [ ] Secrets created in GCP Secret Manager
- [ ] Service account created with correct permissions
- [ ] GitHub secrets configured
- [ ] Cloudflare DNS records added

### Before First Production Deploy

- [ ] EigenCloud account and API key ready
- [ ] Production signer wallet generated and funded
- [ ] EigenCloud secrets configured
- [ ] DNS pointing to EigenCloud endpoint
- [ ] Resolver contracts deployed and configured with signer address

### Per-Release Checklist

- [ ] All tests passing
- [ ] Staging deployment verified
- [ ] Production deployment completed
- [ ] Health check passing
- [ ] Smoke test: create test attestation
- [ ] Monitor error rates for 15 minutes

---

## Cost Estimates (Monthly)

### Staging

| Resource | Estimated Cost |
|----------|----------------|
| Cloud Run (scales to zero) | $0-20 |
| Cloud SQL (db-f1-micro) | ~$10 |
| Secrets Manager | <$1 |
| **Total** | **~$15-30/mo** |

### Production

| Resource | Estimated Cost |
|----------|----------------|
| EigenCloud TEE | TBD (based on usage) |
| DNS (Cloudflare Free) | $0 |
| **Total** | **TBD** |

---

## Troubleshooting

### Staging Issues

```bash
# Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=astral-staging" --limit 50

# Check Cloud SQL connectivity
gcloud sql connect astral-staging-db --user=postgres

# Verify secrets
gcloud secrets versions access latest --secret=astral-staging-db-url
```

### Production Issues

```bash
# Check EigenCloud logs
eigencloud logs astral-compute --tail 100

# Verify service status
eigencloud service describe astral-compute

# Test health endpoint
curl -v https://api.astral.global/health
```

---

## Migration Path: Sepolia → Mainnet

When ready for mainnet:

1. Deploy new production instance with `CHAIN_ID=8453`
2. Update EAS contract address if different
3. Generate new production signer for mainnet
4. Deploy resolver contracts to Base mainnet
5. Update DNS to point to mainnet instance
6. Keep Sepolia instance running for testing

```env
# Mainnet configuration
CHAIN_ID=8453
EAS_CONTRACT_ADDRESS=0x4200000000000000000000000000000000000021
```
