#!/bin/bash
# Deploy to EigenCompute (non-interactive)
#
# Usage:
#   ./scripts/deploy-eigen.sh

set -e

APP_ID="0xB16FA8CAC3f0bfA365b87c258abb1ED444B2F1cD"
IMAGE="ghcr.io/johnx25bd/astral-location-services:latest"
ENV_FILE=".env.eigen"

echo "=== EigenCompute Deployment ==="
echo ""

# Step 1: Build
echo "[1/3] Building Docker image..."
docker build -f packages/astral-service/Dockerfile -t "$IMAGE" .

# Step 2: Push
echo ""
echo "[2/3] Pushing to ghcr.io..."
docker push "$IMAGE"

# Step 3: Deploy
echo ""
echo "[3/3] Deploying to EigenCompute..."
ecloud compute app upgrade "$APP_ID" \
    --image-ref "$IMAGE" \
    --env-file "$ENV_FILE" \
    --instance-type "g1-standard-4t" \
    --log-visibility "private" \
    --resource-usage-monitoring "enable"

echo ""
echo "Done! Monitor with:"
echo "  ecloud compute app logs $APP_ID --follow"
