// fear-greed.js — Crypto Fear & Greed Index collector
'use strict';

const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

const FNG_URL = 'https://api.alternative.me/fng/?limit=1';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'polymarket-bot/1.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 429) {
          reject(new Error('RATE_LIMITED'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Normalize Fear & Greed index (0-100) to -1..+1
 * 50 = 0 (neutral)
 * 0 = -1 (extreme fear = bearish signal? or contrarian bullish?)
 * 100 = +1 (extreme greed = bullish momentum)
 * We treat it as momentum: high greed = bullish signal
 */
function normalize(value) {
  return (value - 50) / 50;
}

async function fetchAndStore() {
  try {
    const data = await httpsGet(FNG_URL);

    if (!data || !data.data || !data.data[0]) {
      throw new Error('Unexpected FNG API response format');
    }

    const entry = data.data[0];
    const rawValue = parseInt(entry.value, 10);
    const classification = entry.value_classification || 'Unknown';
    const normalized = normalize(rawValue);

    const database = getDb();
    const models = database.prepare('SELECT id FROM models WHERE is_active = 1').all();

    const insertSignal = database.prepare(`
      INSERT INTO signals (model_id, source, raw_value, normalized, metadata)
      VALUES (?, 'fear_greed', ?, ?, ?)
    `);

    const meta = JSON.stringify({
      classification,
      timestamp: entry.timestamp,
      raw: rawValue
    });

    for (const model of models) {
      insertSignal.run(model.id, rawValue, normalized, meta);
    }

    console.log(`[FearGreed] ${new Date().toISOString()} Index: ${rawValue} (${classification}) → normalized: ${normalized.toFixed(3)}`);

    // Clean up old fear/greed signals (keep last 30 days)
    database.prepare(`
      DELETE FROM signals
      WHERE source = 'fear_greed'
      AND timestamp < datetime('now', '-30 days')
    `).run();

  } catch (err) {
    if (err.message === 'RATE_LIMITED') {
      console.warn('[FearGreed] Rate limited, will retry next cycle');
    } else {
      console.error('[FearGreed] Error:', err.message);
    }
  }
}

async function run() {
  await fetchAndStore();
}

module.exports = { run, fetchAndStore };

if (require.main === module) {
  console.log('[FearGreed] Starting Fear & Greed collector (1hr interval)...');
  run();
  setInterval(run, 60 * 60 * 1000);
}
