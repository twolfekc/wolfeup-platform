#!/bin/bash
# Deploy readme-generator to the gateway server (10.0.10.10)
# Run this from your local machine to set up or update the cron job

set -e

GATEWAY="${GATEWAY_HOST:-10.0.10.10}"
REMOTE_DIR="/home/tyler/wolfeup-platform/automation/readme-generator"

echo "Deploying readme-generator to $GATEWAY..."

# Sync files (excludes node_modules and logs)
rsync -av --exclude='node_modules' --exclude='logs' \
  "$(dirname "$0")/" \
  "tyler@$GATEWAY:$REMOTE_DIR/"

# Install deps and set up cron on the server
ssh "tyler@$GATEWAY" bash << 'REMOTE'
set -e
cd /home/tyler/wolfeup-platform/automation/readme-generator
npm install --production

# Make sure git is configured in the repo
cd /home/tyler/wolfeup-platform
git config user.name "readme-bot" 2>/dev/null || true
git config user.email "bot@wolfeup.com" 2>/dev/null || true

# Install cron job (every 3 hours with up to 1h of random delay)
CRON_JOB='0 */3 * * * sleep $((RANDOM % 3600)) && cd /home/tyler/wolfeup-platform/automation/readme-generator && node generate.js >> logs/cron.log 2>&1'
(crontab -l 2>/dev/null | grep -v "readme-generator" ; echo "$CRON_JOB") | crontab -

echo "Cron job installed:"
crontab -l | grep readme-generator
REMOTE

echo "Done. readme-generator deployed to $GATEWAY."
echo "Run manually: ssh tyler@$GATEWAY 'cd /home/tyler/wolfeup-platform/automation/readme-generator && node generate.js'"
