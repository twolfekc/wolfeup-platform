// poly-odds.js — Polymarket market odds collector
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
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function isBtc5MinMarket(question) {
  const q = (question || '').toLowerCase();
  return q.includes('btc') && (q.includes('5') || q.includes('minute') || q.includes('5-min'));
}

function parseMarketData(market) {
  // Try to extract up/down odds from outcomes or tokens
  let upOdds = null;
  let downOdds = null;
  let volumeUsdc = null;
  let timeRemaining = null;

  // CLOB format
  if (market.tokens && Array.isArray(market.tokens)) {
    for (const token of market.tokens) {
      const outcome = (token.outcome || '').toLowerCase();
      const price = parseFloat(token.price) || 0;
      if (outcome.includes('up') || outcome.includes('yes') || outcome.includes('higher') || outcome.includes('above')) {
        upOdds = price;
      } else if (outcome.includes('down') || outcome.includes('no') || outcome.includes('lower') || outcome.includes('below')) {
        downOdds = price;
      }
    }
  }

  // Gamma API format
  if (market.outcomePrices) {
    try {
      const prices = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices;
      if (Array.isArray(prices) && prices.length >= 2) {
        upOdds = parseFloat(prices[0]) || null;
        downOdds = parseFloat(prices[1]) || null;
      }
    } catch (e) {}
  }

  // Volume
  volumeUsdc = parseFloat(market.volume || market.volume24hr || market.volumeNum || 0) || 0;

  // Time remaining
  if (market.endDateIso || market.end_date_iso) {
    const endDate = new Date(market.endDateIso || market.end_date_iso);
    const now = new Date();
    timeRemaining = Math.max(0, Math.floor((endDate - now) / 1000));
  }

  return { upOdds, downOdds, volumeUsdc, timeRemaining };
}

async function fetchClobMarkets() {
  try {
    const data = await httpsGet('https://clob.polymarket.com/markets?active=true&closed=false');
    const markets = Array.isArray(data) ? data : (data.data || data.markets || []);
    return markets.filter(m => isBtc5MinMarket(m.question));
  } catch (err) {
    console.warn('[PolyOdds] CLOB API error:', err.message);
    return [];
  }
}

async function fetchGammaMarkets() {
  try {
    const data = await httpsGet('https://gamma-api.polymarket.com/markets?active=true&tag=bitcoin&limit=20');
    const markets = Array.isArray(data) ? data : (data.data || data.markets || []);
    return markets.filter(m => isBtc5MinMarket(m.question));
  } catch (err) {
    console.warn('[PolyOdds] Gamma API error:', err.message);
    return [];
  }
}

async function fetchAndStore() {
  try {
    // Try CLOB first, fallback to Gamma
    let markets = await fetchClobMarkets();

    if (markets.length === 0) {
      console.log('[PolyOdds] No BTC 5-min markets from CLOB, trying Gamma...');
      markets = await fetchGammaMarkets();
    }

    const database = getDb();
    const insert = database.prepare(`
      INSERT INTO market_snapshots (market_id, market_name, up_odds, down_odds, volume_usdc, time_remaining)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    if (markets.length === 0) {
      console.log('[PolyOdds] No BTC 5-min markets found. Storing placeholder.');
      // Store a placeholder so the system knows we checked
      insert.run('btc-5min-placeholder', 'BTC 5-min (no active market)', 0.5, 0.5, 0, 0);
    } else {
      for (const market of markets) {
        const { upOdds, downOdds, volumeUsdc, timeRemaining } = parseMarketData(market);
        const marketId = market.conditionId || market.condition_id || market.id || String(market.marketMakerAddress || '');
        const marketName = market.question || 'Unknown';

        insert.run(marketId, marketName, upOdds, downOdds, volumeUsdc, timeRemaining);
        console.log(`[PolyOdds] ${marketName.substring(0, 60)} | Up: ${upOdds} Down: ${downOdds} | Vol: $${volumeUsdc}`);
      }
    }

    // Store poly_odds signals for active models (based on market skew)
    const activeModels = database.prepare('SELECT id FROM models WHERE is_active = 1').all();
    const insertSignal = database.prepare(`
      INSERT INTO signals (model_id, source, raw_value, normalized, metadata)
      VALUES (?, 'poly_odds', ?, ?, ?)
    `);

    // Compute aggregate signal from all markets found
    let polySignal = 0;
    let validMarkets = markets.filter(m => {
      const { upOdds } = parseMarketData(m);
      return upOdds !== null;
    });

    if (validMarkets.length > 0) {
      const avgUpOdds = validMarkets.reduce((sum, m) => sum + (parseMarketData(m).upOdds || 0.5), 0) / validMarkets.length;
      // Normalize: 0.5 = neutral (0), 1.0 = strong up (+1), 0.0 = strong down (-1)
      polySignal = (avgUpOdds - 0.5) * 2;
    }

    for (const model of activeModels) {
      insertSignal.run(
        model.id,
        polySignal,
        Math.max(-1, Math.min(1, polySignal)),
        JSON.stringify({ markets_found: markets.length, valid_markets: validMarkets.length })
      );
    }

    // Clean up old snapshots (keep last 7 days)
    database.prepare(`
      DELETE FROM market_snapshots
      WHERE timestamp < datetime('now', '-7 days')
    `).run();

    console.log(`[PolyOdds] ${new Date().toISOString()} Stored ${markets.length} markets, signal: ${polySignal.toFixed(3)}`);

  } catch (err) {
    console.error('[PolyOdds] Error:', err.message);
  }
}

async function run() {
  await fetchAndStore();
}

module.exports = { run, fetchAndStore };

if (require.main === module) {
  console.log('[PolyOdds] Starting odds collector (2min interval)...');
  run();
  setInterval(run, 2 * 60 * 1000);
}
