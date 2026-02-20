'use strict';
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const PRUNE_DAYS = 3;

// Ensure logs directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogFile() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(LOG_DIR, `tweetbot-${ymd}.log`);
}

function write(level, component, message, data) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(data && Object.keys(data).length ? { data } : {}),
  };
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(getLogFile(), line);
  } catch (e) {
    process.stderr.write('Logger write error: ' + e.message + '\n');
  }
  // Also print to console for journald capture
  const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${component}]`;
  if (level === 'error') {
    process.stderr.write(`${prefix} ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`);
  } else {
    process.stdout.write(`${prefix} ${message}${data && level !== 'debug' ? ' ' + JSON.stringify(data) : ''}\n`);
  }
}

function pruneOldLogs() {
  try {
    const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    let pruned = 0;
    for (const file of files) {
      if (!file.startsWith('tweetbot-') || !file.endsWith('.log')) continue;
      const filePath = path.join(LOG_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        pruned++;
      }
    }
    if (pruned > 0) {
      write('info', 'logger', `Pruned ${pruned} log file(s) older than ${PRUNE_DAYS} days`);
    }
  } catch (e) {
    process.stderr.write('Log prune error: ' + e.message + '\n');
  }
}

// Prune on startup and every 6 hours
pruneOldLogs();
setInterval(pruneOldLogs, 6 * 60 * 60 * 1000);

const logger = {
  info:  (component, message, data) => write('info',  component, message, data),
  warn:  (component, message, data) => write('warn',  component, message, data),
  error: (component, message, data) => write('error', component, message, data),
  debug: (component, message, data) => write('debug', component, message, data),
};

module.exports = logger;
