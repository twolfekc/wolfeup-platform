// price-feed.js — BTC price collector from CoinGecko
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

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true';

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
          reject(new Error('JSON parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchAndStore() {
  try {
    const data = await httpsGet(COINGECKO_URL);
    const btc = data.bitcoin;
    if (!btc) throw new Error('No bitcoin data in response');

    const price = btc.usd;
    const change24h = btc.usd_24h_change || 0;
    const volume24h = btc.usd_24h_vol || 0;

    const database = getDb();

    // Insert price record
    const insert = database.prepare(`
      INSERT INTO btc_prices (price, change_1h, change_24h, volume_24h)
      VALUES (?, ?, ?, ?)
    `);
    insert.run(price, null, change24h, volume24h);

    // Compute 5-minute momentum (last 5 entries)
    const recent = database.prepare(`
      SELECT price FROM btc_prices ORDER BY timestamp DESC LIMIT 5
    `).all();

    let momentum = 0;
    if (recent.length >= 2) {
      const newest = recent[0].price;
      const oldest = recent[recent.length - 1].price;
      momentum = oldest !== 0 ? (newest - oldest) / oldest : 0;
    }

    // Normalize momentum to -1..+1 (cap at ±0.5% for 5-min = strong signal)
    const normalizedMomentum = Math.max(-1, Math.min(1, momentum / 0.005));

    // Store momentum as a signal for ALL active models
    const models = database.prepare('SELECT id FROM models WHERE is_active = 1').all();
    const insertSignal = database.prepare(`
      INSERT INTO signals (model_id, source, raw_value, normalized, metadata)
      VALUES (?, 'price_momentum', ?, ?, ?)
    `);

    for (const model of models) {
      insertSignal.run(
        model.id,
        momentum,
        normalizedMomentum,
        JSON.stringify({ price, change24h, volume24h, entries_used: recent.length })
      );
    }

    console.log(`[PriceFeed] ${new Date().toISOString()} BTC: $${price.toLocaleString()} | 24h: ${change24h.toFixed(2)}% | Momentum(5): ${(momentum * 100).toFixed(4)}% → norm: ${normalizedMomentum.toFixed(3)}`);

    // Clean up old price data (keep last 1000 entries)
    database.prepare('DELETE FROM btc_prices WHERE id NOT IN (SELECT id FROM btc_prices ORDER BY timestamp DESC LIMIT 1000)').run();

  } catch (err) {
    if (err.message === 'RATE_LIMITED') {
      console.warn('[PriceFeed] Rate limited by CoinGecko, will retry next cycle');
    } else {
      console.error('[PriceFeed] Error:', err.message);
    }
  }
}

// Run immediately on start, then schedule
async function run() {
  await fetchAndStore();
}

// Export for use by start-all.js
module.exports = { run, fetchAndStore };

// If run directly, start the loop
if (require.main === module) {
  console.log('[PriceFeed] Starting price feed (60s interval)...');
  run();
  setInterval(run, 60 * 1000);
}
