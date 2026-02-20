'use strict';
/**
 * deploy-webhook.js
 * Runs on web server (10.0.10.12) port 9999.
 * Receives HMAC-signed webhook payloads from GitHub Actions,
 * verifies the signature, then runs the appropriate deploy script.
 *
 * Routes:
 *   POST /deploy/mission-control
 *   POST /deploy/reply-orchestrator
 *   POST /deploy/auth-service
 *   POST /deploy/ping-platform
 *   GET  /health
 */

const http    = require('http');
const crypto  = require('crypto');
const { execFile } = require('child_process');
const path    = require('path');
const fs      = require('fs');

const PORT          = parseInt(process.env.PORT || '9999');
const WEBHOOK_SECRET = process.env.DEPLOY_WEBHOOK_SECRET || '';
const SCRIPTS_DIR   = process.env.SCRIPTS_DIR || '/home/tyler/deploy-scripts';
const LOG_FILE      = process.env.LOG_FILE || '/home/tyler/deploy-webhook.log';

if (!WEBHOOK_SECRET) {
  console.error('DEPLOY_WEBHOOK_SECRET is not set — webhook verification disabled (INSECURE)');
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function verifySignature(body, signature) {
  if (!WEBHOOK_SECRET) return true; // skip if no secret configured
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

const DEPLOY_SCRIPTS = {
  'mission-control':   'mission-control.sh',
  'reply-orchestrator': 'reply-orchestrator.sh',
  'auth-service':       'auth-service.sh',
  'ping-platform':      'ping-platform.sh',
};

function runDeploy(project, callback) {
  const scriptName = DEPLOY_SCRIPTS[project];
  if (!scriptName) return callback(new Error(`Unknown project: ${project}`));

  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return callback(new Error(`Deploy script not found: ${scriptPath}`));
  }

  log(`Running deploy script: ${scriptPath}`);
  execFile('bash', [scriptPath], { timeout: 300000 }, (err, stdout, stderr) => {
    if (err) {
      log(`Deploy failed for ${project}: ${err.message}`);
      log(`stderr: ${stderr?.slice(0, 500)}`);
    } else {
      log(`Deploy succeeded for ${project}`);
      log(`stdout: ${stdout?.slice(0, 500)}`);
    }
    callback(err, stdout, stderr);
  });
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }

  // Only POST to /deploy/:project
  const match = req.url?.match(/^\/deploy\/([a-z0-9-]+)$/);
  if (req.method !== 'POST' || !match) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const project = match[1];
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const signature = req.headers['x-hub-signature-256'];
    if (!verifySignature(body, signature)) {
      log(`Signature verification failed for /deploy/${project}`);
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    log(`Received valid deploy request for: ${project}`);
    res.writeHead(202);
    res.end(JSON.stringify({ accepted: true, project }));

    // Run deploy in background (after responding)
    setImmediate(() => {
      runDeploy(project, (err) => {
        if (err) log(`Deploy error: ${err.message}`);
      });
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Deploy webhook server listening on port ${PORT}`);
});
