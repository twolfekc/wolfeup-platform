// context-brief.js — Compresses DB state into a ~150-token brief for Sonnet decisions
// generateBrief(modelId) → string
'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');
const BRIEF_DIR = path.join(__dirname, '..', 'data');
const BRIEF_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return 'N/A';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtPct(n) {
  if (n == null) return 'N/A';
  const sign = n >= 0 ? '+' : '';
  return sign + (n * 100).toFixed(2) + '%';
}

function arrow(v) {
  return v == null ? '' : v > 0 ? ' ↑' : v < 0 ? ' ↓' : ' →';
}

function kellyBet(winProb, payoff, bankroll, maxBet) {
  // Kelly fraction = (winProb * payoff - (1 - winProb)) / payoff
  const f = (winProb * payoff - (1 - winProb)) / payoff;
  const quarterKelly = Math.max(0, f * 0.25 * bankroll);
  return Math.min(quarterKelly, maxBet).toFixed(2);
}

// ─── DB queries ────────────────────────────────────────────────────────────

function getBtcData(db) {
  // btc_prices columns: id, timestamp, price, change_1h, change_24h, volume_24h
  const latest = db.prepare(`
    SELECT price, change_1h, change_24h, volume_24h, timestamp
    FROM btc_prices
    ORDER BY timestamp DESC LIMIT 1
  `).get();
  // prev5m: used to compute approximate 5m momentum (fallback)
  const prev5m = db.prepare(`
    SELECT price FROM btc_prices
    ORDER BY timestamp DESC LIMIT 1 OFFSET 5
  `).get();
  return { latest, prev5m };
}

function getMarketSnapshot(db) {
  return db.prepare(`
    SELECT market_id, market_name, up_odds, down_odds, volume_usdc, time_remaining, timestamp
    FROM market_snapshots
    ORDER BY timestamp DESC LIMIT 1
  `).get();
}

function getSignals(db, modelId) {
  // Latest signal per source
  const rows = db.prepare(`
    SELECT source, normalized, raw_value, metadata, timestamp
    FROM signals
    WHERE model_id = ?
    ORDER BY timestamp DESC
  `).all(modelId);
  const map = {};
  for (const r of rows) {
    if (!map[r.source]) map[r.source] = r;
  }
  return map;
}

function getModelAndAccount(db, modelId) {
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(modelId);
  const account = db.prepare('SELECT * FROM paper_accounts WHERE model_id = ?').get(modelId);
  const versionRow = db.prepare(`
    SELECT version_num FROM versions WHERE model_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(modelId);
  return { model, account, versionNum: versionRow ? versionRow.version_num : 1 };
}

function getTradeStats(db, modelId) {
  const trades = db.prepare(`
    SELECT pnl FROM trades WHERE model_id = ? AND status != 'open' ORDER BY closed_at DESC
  `).all(modelId);
  const wins = trades.filter(t => (t.pnl || 0) > 0).length;
  const losses = trades.filter(t => (t.pnl || 0) <= 0).length;
  const total = wins + losses;
  return { wins, losses, total, winRate: total > 0 ? wins / total : 0 };
}

function getLatestSignalRun(db, modelId) {
  return db.prepare(`
    SELECT aggregated_score, direction, confidence, action_taken, timestamp
    FROM signal_runs WHERE model_id = ? ORDER BY timestamp DESC LIMIT 1
  `).get(modelId);
}

function getHourlyPattern(db, modelId) {
  const hour = new Date().getUTCHours();
  const rows = db.prepare(`
    SELECT t.pnl
    FROM trades t
    WHERE t.model_id = ?
      AND t.status != 'open'
      AND strftime('%H', t.opened_at) = printf('%02d', ?)
  `).all(modelId, hour);
  if (rows.length < 3) return null;
  const wins = rows.filter(r => (r.pnl || 0) > 0).length;
  return { hour, count: rows.length, winRate: wins / rows.length };
}

function getOddsHistory(db, marketId) {
  const rows = db.prepare(`
    SELECT up_odds, down_odds, timestamp
    FROM market_snapshots
    WHERE market_id = ?
    ORDER BY timestamp DESC LIMIT 10
  `).all(marketId);
  return rows;
}

// ─── Brief generator ───────────────────────────────────────────────────────

function generateBrief(modelId) {
  const db = getDb();

  const { model, account, versionNum } = getModelAndAccount(db, modelId);
  if (!model) return `[Error: model ${modelId} not found]`;

  const weights = JSON.parse(model.signal_weights || '{}');
  const thresholds = JSON.parse(model.thresholds || '{}');
  const betThreshold = thresholds.bet_threshold || 0.65;
  const maxBet = thresholds.max_bet || 10;

  const balance = account ? account.balance_usdc : 100;
  const startBalance = account ? account.starting_balance : 100;
  const roiPct = ((balance - startBalance) / startBalance * 100).toFixed(1);
  const roiStr = roiPct >= 0 ? `+${roiPct}%` : `${roiPct}%`;

  const { wins, losses, total, winRate } = getTradeStats(db, modelId);
  const latestRun = getLatestSignalRun(db, modelId);
  const preScore = latestRun ? latestRun.aggregated_score : 0;

  // BTC
  const { latest: btc, prev5m } = getBtcData(db);
  let btcLine;
  if (btc) {
    // change_1h is stored as a decimal fraction (e.g. 0.0031 = +0.31%) or percent — detect format
    let change1h = btc.change_1h;
    if (change1h != null && Math.abs(change1h) > 1) {
      // Stored as percent (e.g. 3.1 = 3.1%)
      change1h = change1h / 100;
    }
    const change1hStr = change1h != null ? fmtPct(change1h) : 'N/A';
    // 5m approximate from prev5m record
    const priceChange5m = prev5m && prev5m.price > 0 ? fmtPct((btc.price - prev5m.price) / prev5m.price) : 'N/A';
    btcLine = `BTC: ${fmt$(btc.price)} (${priceChange5m} 5m, ${change1hStr} 1h${btc.volume_24h ? ', Vol: ' + fmt$(btc.volume_24h) + '/24h' : ''})`;
  } else {
    btcLine = 'BTC: no data';
  }

  // Market
  const snap = getMarketSnapshot(db);
  let marketLine;
  if (snap) {
    const upO = snap.up_odds != null ? snap.up_odds.toFixed(2) : '?';
    const downO = snap.down_odds != null ? snap.down_odds.toFixed(2) : '?';
    const timeLeft = snap.time_remaining != null ? `${snap.time_remaining}m remaining` : 'time N/A';
    marketLine = `Market: ${snap.market_name || snap.market_id} | UP: ${upO} / DOWN: ${downO} | Vol: ${snap.volume_usdc ? fmt$(snap.volume_usdc) : 'N/A'} | ${timeLeft}`;
  } else {
    marketLine = 'Market: no active snapshot';
  }

  // Signals
  const sigs = getSignals(db, modelId);
  const lines = [btcLine, marketLine];

  // Momentum
  if (sigs.price_momentum) {
    const v = sigs.price_momentum.normalized;
    const bias = v > 0.1 ? 'bullish' : v < -0.1 ? 'bearish' : 'neutral';
    let detail = '';
    if (btc && prev5m) {
      const delta = btc.price - prev5m.price;
      detail = ` — price ${delta >= 0 ? '+' : ''}${fmt$(delta)} last 5 min`;
    }
    lines.push(`Momentum score: ${v.toFixed(2)}${arrow(v)} (${bias}${detail})`);
  }

  // Odds movement
  if (sigs.poly_odds && snap) {
    const v = sigs.poly_odds.normalized;
    const hist = getOddsHistory(db, snap.market_id);
    let oddsDetail = '';
    if (hist.length >= 2) {
      const oldest = hist[hist.length - 1];
      const newest = hist[0];
      if (oldest.up_odds != null && newest.up_odds != null) {
        oddsDetail = ` (UP odds: ${oldest.up_odds.toFixed(2)}→${newest.up_odds.toFixed(2)} last ${hist.length * 2}min)`;
      }
    }
    const signal = Math.abs(v) > 0.2 ? ', smart money signal' : '';
    lines.push(`Odds movement: ${v.toFixed(2)}${arrow(v)}${oddsDetail}${signal}`);
  }

  // Volume (relative spike detection from market metadata)
  if (sigs.volume) {
    const v = sigs.volume.normalized;
    const label = Math.abs(v) > 0.5 ? 'high spike' : Math.abs(v) > 0.2 ? 'moderate spike' : 'normal';
    lines.push(`Volume: ${v.toFixed(2)}${arrow(v)} (${label})`);
  }

  // Fear & Greed
  if (sigs.fear_greed) {
    const raw = sigs.fear_greed.raw_value;
    let meta = {};
    try { meta = JSON.parse(sigs.fear_greed.metadata || '{}'); } catch (_) {}
    const classification = meta.classification || (raw < 25 ? 'Extreme Fear' : raw < 45 ? 'Fear' : raw < 55 ? 'Neutral' : raw < 75 ? 'Greed' : 'Extreme Greed');
    const bias = raw < 40 ? '→ bearish bias' : raw > 60 ? '→ bullish bias' : '→ neutral';
    lines.push(`Fear & Greed: ${raw}/100 (${classification}) ${bias}`);
  }

  // News
  if (sigs.news_sentiment) {
    const v = sigs.news_sentiment.normalized;
    let headline = '';
    try {
      const meta = JSON.parse(sigs.news_sentiment.metadata || '{}');
      if (meta.articles && meta.articles[0]) {
        const title = meta.articles[0].title || '';
        headline = '"' + title.substring(0, 60) + (title.length > 60 ? '...' : '') + '"';
      }
    } catch (_) {}
    lines.push(`News: ${headline || '(no headline)'} (score: ${v >= 0 ? '+' : ''}${v.toFixed(2)})`);
  }

  // X/Twitter sentiment
  if (sigs.x_sentiment) {
    const v = sigs.x_sentiment.normalized;
    const label = v > 0.3 ? 'Bullish social momentum' : v < -0.3 ? 'Bearish social pressure' : 'Mixed signals';
    lines.push(`X/Twitter: ${label} (score: ${v >= 0 ? '+' : ''}${v.toFixed(2)})`);
  }

  lines.push('─────');

  // Model info
  const SHORT_NAMES = {
    price_momentum: 'mom',
    x_sentiment: 'x',
    news_sentiment: 'news',
    fear_greed: 'fear',
    volume: 'vol',
    poly_odds: 'odds',
  };
  const weightsStr = Object.entries(weights)
    .map(([k, v]) => `${SHORT_NAMES[k] || k}×${v}`)
    .join(' ');
  lines.push(`Model: ${model.name} (v${versionNum}) | Balance: ${fmt$(balance)} (${roiStr}) | W:${wins} L:${losses} (${(winRate * 100).toFixed(0)}%)`);
  lines.push(`Signal weights: ${weightsStr}`);

  // Pre-score and threshold
  const direction = preScore > 0.1 ? 'up' : preScore < -0.1 ? 'down' : 'hold';
  lines.push(`Pre-score: ${preScore.toFixed(2)} | Threshold: ${betThreshold} | Direction bias: ${direction.toUpperCase()}`);

  // Hourly pattern
  const hourPat = getHourlyPattern(db, modelId);
  if (hourPat && hourPat.count >= 3) {
    lines.push(`Pattern: Hour ${hourPat.hour} UTC win rate ${(hourPat.winRate * 100).toFixed(0)}% (${hourPat.count} trades)`);
  }

  // Kelly bet suggestion
  const absScore = Math.abs(preScore);
  if (absScore > 0.4 && snap) {
    const entryOdds = direction === 'up' ? (snap.up_odds || 0.5) : (snap.down_odds || 0.5);
    const payoff = entryOdds > 0 ? (1 / entryOdds) - 1 : 1;
    const winProb = 0.5 + absScore * 0.3; // model confidence → win probability
    const suggestedBet = kellyBet(winProb, payoff, balance, maxBet);
    lines.push(`Kelly suggested bet: ${fmt$(parseFloat(suggestedBet))} (quarter-Kelly on ${fmt$(balance)} balance)`);
  }

  return lines.join('\n');
}

// ─── File cache ────────────────────────────────────────────────────────────

function getBriefPath(modelId) {
  return path.join(BRIEF_DIR, `context-brief-${modelId}.json`);
}

function loadCachedBrief(modelId) {
  const p = getBriefPath(modelId);
  try {
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const age = Date.now() - new Date(data.generated_at).getTime();
    if (age > BRIEF_TTL_MS) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function saveBrief(modelId, text) {
  const p = getBriefPath(modelId);
  const data = { text, generated_at: new Date().toISOString(), model_id: modelId };
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[ContextBrief] Failed to save brief:', err.message);
  }
  return data;
}

/**
 * Get brief for a model — from cache if fresh, else generate and cache.
 * @param {number} modelId
 * @param {boolean} forceRefresh
 * @returns {{ text: string, generated_at: string, model_id: number }}
 */
function getBrief(modelId, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = loadCachedBrief(modelId);
    if (cached) return cached;
  }
  const text = generateBrief(modelId);
  return saveBrief(modelId, text);
}

module.exports = { generateBrief, getBrief, saveBrief };

// ─── CLI test ───────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--test') || args.includes('--all')) {
    const Database2 = require('better-sqlite3');
    const db2 = new Database2(DB_PATH);
    const models = db2.prepare('SELECT id, name FROM models WHERE is_active = 1').all();
    db2.close();

    console.log('[ContextBrief] Generating briefs for all active models...\n');
    for (const m of models) {
      const brief = getBrief(m.id, true);
      console.log(`═══ Model ${m.id}: ${m.name} ═══`);
      console.log(brief.text);
      console.log(`Generated at: ${brief.generated_at}`);
      console.log('');
    }
    process.exit(0);
  } else {
    const modelId = parseInt(args[0] || '1', 10);
    const brief = getBrief(modelId, true);
    console.log(brief.text);
  }
}
