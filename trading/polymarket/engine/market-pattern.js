// market-pattern.js — Pattern memory for market conditions. Zero AI — pure math.
'use strict';

const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH       = path.join(__dirname, '..', 'data', 'poly.db');
const PATTERNS_PATH = path.join(__dirname, '..', 'data', 'patterns.json');

const EMPTY_PATTERNS = {
  version: 2,
  updated_at: null,
  hourly: {},
  btc_momentum: {
    high_up:   { wins: 0, total: 0, win_rate: null },
    high_down: { wins: 0, total: 0, win_rate: null },
    low:       { wins: 0, total: 0, win_rate: null }
  },
  odds_ev: {},
  market_vig: {}
};

function loadPatterns() {
  try {
    if (fs.existsSync(PATTERNS_PATH)) return JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));
  } catch (e) { console.warn('[Pattern] Could not load patterns.json:', e.message); }
  return JSON.parse(JSON.stringify(EMPTY_PATTERNS));
}

function savePatterns(patterns) {
  patterns.updated_at = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(PATTERNS_PATH), { recursive: true });
    fs.writeFileSync(PATTERNS_PATH, JSON.stringify(patterns, null, 2), 'utf8');
  } catch (e) { console.error('[Pattern] Cannot save patterns.json:', e.message); }
}

let _db;
function getDb() {
  if (!_db) { _db = new Database(DB_PATH); _db.pragma('journal_mode = WAL'); }
  return _db;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Returns odds-range bucket key. direction = 'up'|'down', odds = 0..1.
 * Tracked ranges: [0.25,0.35), [0.35,0.45), [0.45,0.55)
 */
function oddsRangeKey(direction, odds) {
  if (odds >= 0.45 && odds < 0.55) return `${direction}_45_55`;
  if (odds >= 0.35 && odds < 0.45) return `${direction}_35_45`;
  if (odds >= 0.25 && odds < 0.35) return `${direction}_25_35`;
  return null;
}

/**
 * Implied probability midpoint for a bucket key.
 * e.g. "up_35_45" → 0.40
 */
function impliedProbForKey(key) {
  const parts = key.split('_');
  const lo = parseInt(parts[parts.length - 2]) / 100;
  const hi = parseInt(parts[parts.length - 1]) / 100;
  return (lo + hi) / 2;
}

function btcMomentumKey(change1h) {
  if (change1h == null) return 'low';
  if (change1h >  2)   return 'high_up';
  if (change1h < -2)   return 'high_down';
  return 'low';
}

// ── Core analysis ────────────────────────────────────────────────────────────

function runPatternAnalysis() {
  const db       = getDb();
  const patterns = loadPatterns();

  // Reset computed sections
  patterns.hourly       = {};
  patterns.btc_momentum = JSON.parse(JSON.stringify(EMPTY_PATTERNS.btc_momentum));
  patterns.odds_ev      = {};

  const trades = db.prepare(`
    SELECT t.id, t.direction, t.entry_odds, t.pnl, t.opened_at, t.market_id
    FROM trades t
    WHERE t.status IN ('closed','expired') AND t.pnl IS NOT NULL
    ORDER BY t.opened_at ASC
  `).all();

  const btcRows = db.prepare(
    'SELECT timestamp, change_1h FROM btc_prices ORDER BY timestamp ASC'
  ).all();

  function findBtcChange(ts) {
    if (!btcRows.length) return null;
    const tradeMs = new Date(ts).getTime();
    let best = btcRows[0];
    let bestDiff = Infinity;
    for (const row of btcRows) {
      const diff = Math.abs(new Date(row.timestamp).getTime() - tradeMs);
      if (diff < bestDiff) { bestDiff = diff; best = row; }
    }
    return bestDiff <= 30 * 60 * 1000 ? best.change_1h : null;
  }

  for (const trade of trades) {
    const isWin = (trade.pnl || 0) > 0 ? 1 : 0;

    // Hourly
    const h = String(new Date(trade.opened_at).getUTCHours());
    if (!patterns.hourly[h]) patterns.hourly[h] = { wins: 0, total: 0, win_rate: null, is_weak: false };
    patterns.hourly[h].wins  += isWin;
    patterns.hourly[h].total += 1;

    // BTC momentum
    const ch   = findBtcChange(trade.opened_at);
    const mKey = btcMomentumKey(ch);
    patterns.btc_momentum[mKey].wins  += isWin;
    patterns.btc_momentum[mKey].total += 1;

    // Odds EV
    if (trade.entry_odds != null) {
      const oKey = oddsRangeKey(trade.direction, trade.entry_odds);
      if (oKey) {
        if (!patterns.odds_ev[oKey]) {
          patterns.odds_ev[oKey] = {
            wins: 0, total: 0,
            implied_prob: impliedProbForKey(oKey),
            actual_win_rate: null,
            ev: null
          };
        }
        patterns.odds_ev[oKey].wins  += isWin;
        patterns.odds_ev[oKey].total += 1;
      }
    }
  }

  // Derived metrics
  for (const data of Object.values(patterns.hourly)) {
    data.win_rate = data.total > 0 ? data.wins / data.total : null;
    data.is_weak  = data.total >= 10 && data.win_rate !== null && data.win_rate < 0.40;
  }
  for (const data of Object.values(patterns.btc_momentum)) {
    data.win_rate = data.total > 0 ? data.wins / data.total : null;
  }
  for (const data of Object.values(patterns.odds_ev)) {
    data.actual_win_rate = data.total > 0 ? data.wins / data.total : null;
    if (data.actual_win_rate !== null) {
      data.ev = parseFloat((data.actual_win_rate - data.implied_prob).toFixed(4));
    }
  }

  // Vig
  try {
    const vigData = db.prepare(`
      SELECT market_id,
             AVG(up_odds + down_odds) as avg_total,
             COUNT(*) as samples
      FROM market_snapshots
      WHERE up_odds IS NOT NULL AND down_odds IS NOT NULL
        AND up_odds > 0 AND down_odds > 0
      GROUP BY market_id
    `).all();
    for (const row of vigData) {
      patterns.market_vig[row.market_id] = {
        avg_vig:   parseFloat(((row.avg_total - 1.0) * 100).toFixed(3)),
        avg_total: parseFloat(row.avg_total.toFixed(4)),
        samples:   row.samples
      };
    }
  } catch (_) {}

  savePatterns(patterns);
  console.log(`[Pattern] ${trades.length} trades, ${Object.keys(patterns.hourly).length} hourly buckets, ${Object.keys(patterns.odds_ev).length} EV buckets`);
  return patterns;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute edge score 0..1 for a trade condition.
 * 1 = strong historical edge, 0.5 = neutral, 0 = historically bad.
 *
 * @param {'up'|'down'} direction
 * @param {number}      currentOdds      0..1
 * @param {number}      hourOfDay        0..23 UTC
 * @param {number}      recentVolatility BTC 1h % change (absolute)
 */
function getMarketEdge(direction, currentOdds, hourOfDay, recentVolatility) {
  const patterns = loadPatterns();
  let score = 0.5;

  // Time-of-day
  const hourData = patterns.hourly[String(Math.floor(hourOfDay))];
  if (hourData && hourData.total >= 5 && hourData.win_rate !== null) {
    score += (hourData.win_rate - 0.5);
    if (hourData.is_weak) score -= 0.15;
  }

  // Odds EV
  const oKey = oddsRangeKey(direction, currentOdds);
  if (oKey && patterns.odds_ev[oKey] && patterns.odds_ev[oKey].total >= 5) {
    const ev = patterns.odds_ev[oKey].ev || 0;
    score += clamp(ev, -0.3, 0.3);
  }

  // BTC volatility penalty
  if (recentVolatility != null) {
    if (recentVolatility > 5)      score -= 0.25;
    else if (recentVolatility > 2) score -= 0.10;
  }

  return parseFloat(clamp(score, 0, 1).toFixed(4));
}

function isWeakPeriod(hourOfDay) {
  const p = loadPatterns();
  const d = p.hourly[String(Math.floor(hourOfDay))];
  return d ? d.is_weak : false;
}

function getOddsEV(direction, odds) {
  const p    = loadPatterns();
  const oKey = oddsRangeKey(direction, odds);
  if (!oKey) return null;
  const d = p.odds_ev[oKey];
  return (d && d.total >= 5) ? d.ev : null;
}

function getMarketVig(marketId) {
  const p = loadPatterns();
  const d = p.market_vig[marketId];
  return d ? d.avg_vig / 100 : null;
}

module.exports = { runPatternAnalysis, getMarketEdge, isWeakPeriod, getOddsEV, getMarketVig, loadPatterns, savePatterns };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--test') || args.includes('--run')) {
    console.log('[Pattern] Running analysis...');
    const p = runPatternAnalysis();
    console.log('[Pattern] Hourly:', JSON.stringify(p.hourly, null, 2));
    console.log('[Pattern] EV:', JSON.stringify(p.odds_ev, null, 2));
    const edge = getMarketEdge('up', 0.48, new Date().getUTCHours(), 1.2);
    console.log(`[Pattern] Sample edge: ${edge}`);
  }
}
