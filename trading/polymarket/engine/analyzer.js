// analyzer.js — Post-trade win/loss analyzer
// Called after every trade closes. Attributes P&L to signal sources.
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function getSignalsAtTradeTime(db, trade) {
  const run = db.prepare(`
    SELECT * FROM signal_runs
    WHERE model_id = ? AND timestamp <= ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(trade.model_id, trade.opened_at);

  if (!run) return { run: null, signals: [] };

  const signals = db.prepare(`
    SELECT * FROM signals
    WHERE model_id = ?
      AND timestamp BETWEEN datetime(?, '-5 minutes') AND ?
    ORDER BY timestamp DESC
  `).all(trade.model_id, run.timestamp, run.timestamp);

  let enhanced = [];
  try {
    enhanced = db.prepare(`
      SELECT * FROM signals_enhanced
      WHERE model_id = ?
        AND timestamp BETWEEN datetime(?, '-5 minutes') AND ?
      ORDER BY timestamp DESC
    `).all(trade.model_id, run.timestamp, run.timestamp);
  } catch (_) {}

  return { run, signals: [...signals, ...enhanced] };
}

function getBtcContextAt(db, timestamp) {
  const row = db.prepare(`
    SELECT price, change_1h, change_24h FROM btc_prices
    WHERE timestamp BETWEEN datetime(?, '-15 minutes') AND datetime(?, '+15 minutes')
    ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
    LIMIT 1
  `).get(timestamp, timestamp, timestamp);
  return row || { price: null, change_1h: null, change_24h: null };
}

function getFearGreedAt(db, modelId, timestamp) {
  const row = db.prepare(`
    SELECT normalized FROM signals
    WHERE model_id = ? AND source = 'fear_greed'
      AND timestamp BETWEEN datetime(?, '-30 minutes') AND datetime(?, '+5 minutes')
    ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
    LIMIT 1
  `).get(modelId, timestamp, timestamp, timestamp);
  return row ? row.normalized : null;
}

function getNewsAt(db, modelId, timestamp) {
  const rows = db.prepare(`
    SELECT normalized FROM signals
    WHERE model_id = ? AND source = 'news_sentiment'
      AND timestamp BETWEEN datetime(?, '-30 minutes') AND datetime(?, '+5 minutes')
  `).all(modelId, timestamp, timestamp);
  if (!rows.length) return null;
  return rows.reduce((s, r) => s + r.normalized, 0) / rows.length;
}

function getBtcRegime(change1h) {
  if (change1h == null) return 'unknown';
  if (change1h > 1.5)  return 'bullish';
  if (change1h < -1.5) return 'bearish';
  return 'sideways';
}

/**
 * Score signal contributions.
 * contribution > 0 → signal agreed with direction, positive for outcome
 */
function scoreSignalContributions(signals, tradeDirection, tradeOutcome) {
  const dirMult = tradeDirection === 'up' ? 1 : -1;
  const outMult = tradeOutcome === 'win' ? 1 : -1;
  const seen = new Set();
  const contributions = {};

  for (const sig of signals) {
    if (seen.has(sig.source)) continue;
    seen.add(sig.source);
    const normalized = sig.normalized || 0;
    const alignment  = normalized * dirMult;      // how aligned with direction taken
    contributions[sig.source] = parseFloat((alignment * outMult).toFixed(4));
  }
  return contributions;
}

function determineVerdict(trade, btcContext, fearGreed, signalContributions) {
  const pnl   = trade.pnl || 0;
  const isWin = pnl > 0;

  if (isWin && pnl > trade.amount_usdc * 0.1) return 'good_trade';

  const entry = trade.entry_odds || 0.5;
  const isBadOdds = (trade.direction === 'up' && entry < 0.3) ||
                    (trade.direction === 'down' && entry > 0.7);
  if (isBadOdds && !isWin) return 'bad_edge';

  const ch = btcContext.change_1h || 0;
  if (!isWin && ((trade.direction === 'up' && ch < -2) || (trade.direction === 'down' && ch > 2))) {
    return 'market_reversal';
  }

  if (!isWin) {
    const scores = Object.values(signalContributions);
    if (scores.length > 0 && scores.reduce((a, b) => a + b, 0) / scores.length > 0.1) {
      return 'timing';
    }
    return 'signal_failure';
  }
  return 'good_trade';
}

function buildAdjustmentSuggestions(signalContributions) {
  const suggestions = {};
  for (const [source, contribution] of Object.entries(signalContributions)) {
    const delta = parseFloat((contribution * 0.05).toFixed(4));
    if (Math.abs(delta) >= 0.001) suggestions[source] = delta;
  }
  return suggestions;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyze a closed trade and store in trade_analyses.
 * @param {number} tradeId
 * @returns {object|null}
 */
function analyzeTrade(tradeId) {
  const db = getDb();

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  if (!trade) { console.error(`[Analyzer] Trade ${tradeId} not found`); return null; }
  if (trade.status === 'open') { console.warn(`[Analyzer] Trade ${tradeId} still open`); return null; }

  let existing;
  try {
    existing = db.prepare('SELECT id FROM trade_analyses WHERE trade_id = ?').get(tradeId);
  } catch (_) {
    console.warn('[Analyzer] trade_analyses table missing. Run schema-v2.sql first.');
    return null;
  }
  if (existing) return db.prepare('SELECT * FROM trade_analyses WHERE trade_id = ?').get(tradeId);

  const pnl     = trade.pnl || 0;
  const outcome = pnl > 0 ? 'win' : 'loss';

  const { run, signals }   = getSignalsAtTradeTime(db, trade);
  const btcContext          = getBtcContextAt(db, trade.opened_at);
  const fearGreed           = getFearGreedAt(db, trade.model_id, trade.opened_at);
  const newsSent            = getNewsAt(db, trade.model_id, trade.opened_at);

  const signalContributions  = scoreSignalContributions(signals, trade.direction, outcome);
  const verdict              = determineVerdict(trade, btcContext, fearGreed, signalContributions);
  const adjustmentSuggestions = buildAdjustmentSuggestions(signalContributions);

  const marketConditions = {
    btc_price:      btcContext.price,
    btc_change_1h:  btcContext.change_1h,
    btc_change_24h: btcContext.change_24h,
    btc_regime:     getBtcRegime(btcContext.change_1h),
    fear_greed:     fearGreed,
    news_sentiment: newsSent,
    entry_odds:     trade.entry_odds,
    exit_odds:      trade.exit_odds,
    pnl,
    outcome
  };

  const insertResult = db.prepare(`
    INSERT INTO trade_analyses
      (trade_id, model_id, verdict, signal_contributions, adjustment_suggestions, market_conditions)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    tradeId, trade.model_id, verdict,
    JSON.stringify(signalContributions),
    JSON.stringify(adjustmentSuggestions),
    JSON.stringify(marketConditions)
  );

  const emoji = pnl >= 0 ? '✅' : '❌';
  console.log(`[Analyzer] ${emoji} Trade #${tradeId} → ${outcome} | Verdict: ${verdict} | P&L: $${pnl.toFixed(4)}`);

  return {
    analysis_id:             insertResult.lastInsertRowid,
    trade_id:                tradeId,
    model_id:                trade.model_id,
    market:                  trade.market_name || trade.market_id,
    direction:               trade.direction,
    amount:                  trade.amount_usdc,
    pnl,
    outcome,
    verdict,
    signal_run_id:           run ? run.id : null,
    signals_active:          signals.map(s => s.source),
    signal_contributions,
    adjustment_suggestions:  adjustmentSuggestions,
    market_conditions:       marketConditions
  };
}

/**
 * Analyze all unanalyzed closed trades.
 */
function analyzeAllPending(modelId) {
  const db = getDb();
  let pending;
  try {
    if (modelId) {
      pending = db.prepare(`
        SELECT t.id FROM trades t
        LEFT JOIN trade_analyses ta ON ta.trade_id = t.id
        WHERE t.model_id = ? AND t.status != 'open' AND ta.id IS NULL
      `).all(modelId);
    } else {
      pending = db.prepare(`
        SELECT t.id FROM trades t
        LEFT JOIN trade_analyses ta ON ta.trade_id = t.id
        WHERE t.status != 'open' AND ta.id IS NULL
      `).all();
    }
  } catch (_) {
    console.warn('[Analyzer] trade_analyses table missing. Run schema-v2.sql first.');
    return [];
  }

  console.log(`[Analyzer] Analyzing ${pending.length} pending trades...`);
  return pending.map(row => analyzeTrade(row.id)).filter(Boolean);
}

module.exports = { analyzeTrade, analyzeAllPending };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--test')) {
    console.log('[Analyzer] Module loaded OK');
    const results = analyzeAllPending(null);
    console.log(`[Analyzer] Analyzed ${results.length} trades.`);
    if (results.length === 0) console.log('[Analyzer] No pending trades (DB may be empty).');
  } else if (args[0] && !isNaN(parseInt(args[0]))) {
    const result = analyzeTrade(parseInt(args[0]));
    if (result) console.log(JSON.stringify(result, null, 2));
  }
}
