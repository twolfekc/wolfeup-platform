#!/bin/bash
# Deploy mission-control to web server (10.0.10.12)
# Called by deploy-webhook.js when GitHub pushes to services/mission-control/**
set -e

REPO_DIR="/home/tyler/wolfeup-platform"
SERVICE_DIR="$REPO_DIR/services/mission-control"

echo "[$(date -u +%FT%TZ)] Starting mission-control deploy..."

# Pull latest from GitHub
cd "$REPO_DIR"
git fetch origin main
git reset --hard origin/main
echo "Git: pulled latest"

# Build Docker image
cd "$SERVICE_DIR"
docker build -t mission-control:latest .
echo "Docker: build complete"

# Stop old container, start new one (preserving volume mounts)
docker rm -f mission_control 2>/dev/null || true
docker run -d \
  --name mission_control \
  --network games-platform_frontend \
  --restart unless-stopped \
  -p 5070:5070 \
  -v /home/tyler/.data/mission-control:/app/.data \
  --env-file /home/tyler/.env.mission-control \
  mission-control:latest

echo "[$(date -u +%FT%TZ)] mission-control deploy complete"
