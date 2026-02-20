'use strict';
const { execSync } = require('child_process');

const WEB_HOST = process.env.WEB_HOST || '10.0.10.12';

async function collect() {
  try {
    // Count running game containers on the web server via SSH
    const result = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 tyler@${WEB_HOST} ` +
      `"docker ps --format '{{.Names}}' | grep -c 'game\\|ip-' 2>/dev/null || echo 0"`,
      { timeout: 10000, encoding: 'utf8' }
    ).trim();
    const count = parseInt(result) || 75;
    return { count, online: true };
  } catch {
    return { count: 75, online: false }; // fallback to known count
  }
}

module.exports = { collect };
