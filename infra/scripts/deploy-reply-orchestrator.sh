#!/bin/bash
# Deploy reply-orchestrator to gateway server (10.0.10.10)
# Called by deploy-webhook.js on the gateway itself
set -e

REPO_DIR="/home/tyler/wolfeup-platform"
SERVICE_DIR="$REPO_DIR/services/reply-orchestrator"

echo "[$(date -u +%FT%TZ)] Starting reply-orchestrator deploy..."

# Pull latest from GitHub
cd "$REPO_DIR"
git fetch origin main
git reset --hard origin/main
echo "Git: pulled latest"

# Sync source to workspace
rsync -av --exclude='node_modules' --exclude='data' --exclude='logs' \
  "$SERVICE_DIR/" \
  "/home/tyler/.openclaw/workspace/reply-orchestrator/"
echo "Rsync: workspace updated"

# Install deps if package.json changed
cd /home/tyler/.openclaw/workspace/reply-orchestrator
npm install --production
echo "npm: deps installed"

# Restart the service
systemctl --user restart reply-orchestrator.service
echo "Service: restarted"

# Wait and check status
sleep 2
if systemctl --user is-active --quiet reply-orchestrator.service; then
  echo "[$(date -u +%FT%TZ)] reply-orchestrator deploy complete (service active)"
else
  echo "[$(date -u +%FT%TZ)] WARNING: service may not be running"
  systemctl --user status reply-orchestrator.service --no-pager || true
fi
