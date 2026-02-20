#!/usr/bin/env bash
set -euo pipefail

# Starter orchestration script for OpenClaw -> Convex sync.
# Requires Node.js 18+ for fetch.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p tmp

echo "[sync] Pulling OpenClaw payload..."
node scripts/openclaw-sync/pull-openclaw.ts

echo "[sync] Pushing payload to Convex..."
node scripts/openclaw-sync/push-convex.ts

echo "[sync] Done. Report: $ROOT_DIR/tmp/sync-report.json"
