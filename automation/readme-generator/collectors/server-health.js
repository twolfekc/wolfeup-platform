'use strict';
const { execSync } = require('child_process');

const SERVERS = [
  { name: 'Gateway',    host: process.env.GATEWAY_HOST    || '10.0.10.10' },
  { name: 'Mac Node',   host: process.env.NODE_HOST        || '10.0.10.11' },
  { name: 'Web Server', host: process.env.WEB_HOST         || '10.0.10.12' },
  { name: 'RTX 4090',   host: process.env.GPU_HOST         || '192.168.1.70' },
  { name: 'NAS',        host: process.env.NAS_HOST         || '192.168.1.2' },
];

async function checkServer(server) {
  try {
    const result = execSync(
      `ping -c 1 -W 1 ${server.host} 2>/dev/null | grep -oP '(?<=time=)\\S+'`,
      { timeout: 3000, encoding: 'utf8' }
    ).trim();
    return { ...server, online: true, latencyMs: parseFloat(result) || null };
  } catch {
    return { ...server, online: false, latencyMs: null };
  }
}

async function collect() {
  const results = await Promise.all(SERVERS.map(checkServer));
  const online = results.filter(r => r.online).length;
  return { servers: results, onlineCount: online, totalCount: SERVERS.length };
}

module.exports = { collect };
