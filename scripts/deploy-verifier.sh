#!/usr/bin/env bash
# Deploy any commit or branch to the lab verifier node.
#
# Runs ON the verifier node, from the repo root. Pull-based because GitHub
# Actions cannot reach the lab LAN: fetch the ref, build the image from
# source (CI only publishes images for main), and restart the stack.
#
# Usage: scripts/deploy-verifier.sh [branch|sha]   (default: main)
#
# Requires a .env file next to docker-compose.verifier.yml providing at
# least SIGNER_PRIVATE_KEY and the schema UIDs — see .env.example.
set -euo pipefail

REF="${1:-main}"
cd "$(dirname "$0")/.."

git fetch origin --prune

# Prefer the remote-tracking ref so branch deploys pick up new commits;
# fall back to a raw SHA or tag.
if git rev-parse --verify --quiet "origin/${REF}" >/dev/null; then
  git checkout --detach "origin/${REF}"
else
  git checkout --detach "${REF}"
fi

GIT_SHA="$(git rev-parse HEAD)"
export GIT_SHA

echo "Building ${GIT_SHA} (${REF})..."
docker compose -f docker-compose.verifier.yml build app
docker compose -f docker-compose.verifier.yml up -d

echo "Waiting for health..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
    echo "Deployed:"
    curl -fsS http://localhost:3000/health
    echo
    exit 0
  fi
  sleep 2
done

echo "Health check failed after 60s; recent app logs:" >&2
docker compose -f docker-compose.verifier.yml logs --tail 50 app >&2
exit 1
