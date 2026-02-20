// self-improver.js — Core learning loop for the trading bot
// Runs after every 5 closed trades (or once/hour).
// Adjusts signal weights, thresholds, and manages blackout conditions.
'use strict';

const Database = require('better-sqlite3');
const fs   = require('fs');
const path = require('path');

const DB_PATH      = path.join(__dirname, '..', 'data', 'poly.db');
const BLACKOUT_PATH = path.join(__dirname, '..', 'data', 'blackout.json');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_SIZE          = 20;    // Look at last N trades
const MIN_TRADES_TO_ADJUST = 5;     // Need at least 5 trades before adjusting
const LEARNING_RATE_BASE   = 0.3;   // Starts here, decreases with more data
const LEARNING_RATE_MIN    = 0.05;  // Floor for learning rate
const WEIGHT_MIN           = 0.02;  // Minimum weight a signal can have
const WEIGHT_MAX           = 0.50;  // Maximum weight a signal can have
const MAX_WEIGHT_CHANGE    = 0.15;  // Max change in a single learning session (±15%)
const THRESHOLD_MIN        = 0.50;
const THRESHOLD_MAX        = 0.90;
const BLACKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const CONSECUTIVE_LOSS_TRIGGER = 3;
const WIN_RATE_LOW         = 0.45;
const WIN_RATE_HIGH        = 0.65;
const BTC_HIGH_VOLATILITY  = 5.0;   // % 1h change that triggers confidence penalty

// ─────────────────────────────────────────────────────────────────────────────
// DB & file helpers
// ─────────────────────────────────────────────────────────────────────────────

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

function loadBlackout() {
  try {
    if (fs.existsSync(BLACKOUT_PATH)) {
      return JSON.parse(fs.readFileSync(BLACKOUT_PATH, 'utf8'));
    }
  } catch (_) {}
  return { models: {}, global: {}, updated_at: null };
}

function saveBlackout(state) {
  state.updated_at = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(BLACKOUT_PATH), { recursive: true });
    fs.writeFileSync(BLACKOUT_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[Improver] Could not save blackout.json:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a value between lo and hi */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute Pearson correlation between two equal-length arrays.
 * Returns 0 if insufficient data or zero variance.
 */
function pearsonCorrelation(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dX = 0, dY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dX  += dx * dx;
    dY  += dy * dy;
  }
  const denom = Math.sqrt(dX * dY);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Compute adaptive learning rate.
 * More data → smaller adjustments (more confident existing weights are tuned).
 *
 * Formula: lr = max(LEARNING_RATE_MIN, LEARNING_RATE_BASE / (1 + tradeCount/50))
 * At 50 trades: lr = 0.3 / 2 = 0.15
 * At 200 trades: lr = 0.3 / 5 = 0.06
 */
function computeLearningRate(tradeCount) {
  return Math.max(LEARNING_RATE_MIN, LEARNING_RATE_BASE / (1 + tradeCount / 50));
}

/**
 * Re-normalize a weights object so all values sum to 1.0.
 * Each weight is also clamped to [WEIGHT_MIN, WEIGHT_MAX] before normalizing.
 */
function normalizeWeights(weights) {
  // Clamp first
  const clamped = {};
  for (const [k, v] of Object.entries(weights)) {
    clamped[k] = clamp(v, WEIGHT_MIN, WEIGHT_MAX);
  }
  // Sum
  const total = Object.values(clamped).reduce((a, b) => a + b, 0);
  if (total === 0) return clamped; // degenerate case
  // Normalize
  const normalized = {};
  for (const [k, v] of Object.entries(clamped)) {
    normalized[k] = parseFloat((v / total).toFixed(6));
  }
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

/** Load all active models from DB */
function loadModels() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM models WHERE is_active = 1").all();
  return rows.map(row => ({
    ...row,
    signal_weights: JSON.parse(row.signal_weights || '{}'),
    thresholds:     JSON.parse(row.thresholds || '{}')
  }));
}

/**
 * Load last N closed trades for a model, with their signal context.
 * Returns enriched trade objects.
 */
function loadRecentTrades(modelId, limit = WINDOW_SIZE) {
  const db = getDb();

  const trades = db.prepare(`
    SELECT t.*, ta.signal_contributions, ta.market_conditions, ta.verdict
    FROM trades t
    LEFT JOIN trade_analyses ta ON ta.trade_id = t.id
    WHERE t.model_id = ?
      AND t.status IN ('closed','expired')
      AND t.pnl IS NOT NULL
    ORDER BY t.closed_at DESC
    LIMIT ?
  `).all(modelId, limit);

  return trades.map(t => ({
    ...t,
    signal_contributions: t.signal_contributions ? JSON.parse(t.signal_contributions) : {},
    market_conditions:    t.market_conditions    ? JSON.parse(t.market_conditions)    : {},
    is_win: (t.pnl || 0) > 0
  }));
}

/**
 * Get latest BTC volatility (1h % change absolute value).
 */
function getLatestBtcVolatility() {
  const db = getDb();
  const row = db.prepare(`
    SELECT ABS(change_1h) as vol FROM btc_prices
    ORDER BY timestamp DESC LIMIT 1
  `).get();
  return row ? row.vol : null;
}

/**
 * Get latest fear/greed value (mapped from normalized -1..1 to 0..100).
 */
function getLatestFearGreed(modelId) {
  const db = getDb();
  // Try signals table
  const row = db.prepare(`
    SELECT normalized FROM signals
    WHERE model_id = ? AND source = 'fear_greed'
    ORDER BY timestamp DESC LIMIT 1
  `).get(modelId);
  if (!row) return null;
  // normalized is -1..+1, map to 0..100
  return Math.round((row.normalized + 1) / 2 * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core algorithm: Signal accuracy scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each signal source, compute accuracy, strength_correlation, and edge.
 *
 * @param {Array} trades — enriched trade objects with signal_contributions
 * @returns {object} { source: { accuracy, strength_correlation, edge, sample_count } }
 */
function scoreSignals(trades) {
  // Collect per-source data
  const sourceData = {}; // source → { matches: [], pnls: [], strengths: [] }

  for (const trade of trades) {
    const contributions = trade.signal_contributions;
    if (!contributions || Object.keys(contributions).length === 0) continue;

    // Each contribution value: positive = signal was "right" (given outcome)
    // We need to reconstruct: was the signal aligned with the direction?
    // contribution = alignment * outcome_multiplier
    // If trade won (outcome=win, mult=+1): contribution = alignment
    // If trade lost (outcome=loss, mult=-1): contribution = -alignment
    // So: alignment = contribution * (isWin ? 1 : -1)
    const outMult = trade.is_win ? 1 : -1;

    for (const [source, contribution] of Object.entries(contributions)) {
      if (!sourceData[source]) {
        sourceData[source] = { correct: 0, total: 0, strengths: [], pnls: [] };
      }
      const alignment = contribution * outMult; // positive = signal agreed with direction
      const signalWasRight = alignment > 0; // signal pointed in direction taken

      sourceData[source].total++;
      if (signalWasRight) sourceData[source].correct++;
      sourceData[source].strengths.push(Math.abs(alignment)); // signal strength
      sourceData[source].pnls.push(trade.pnl || 0);
    }
  }

  // Compute scores
  const scores = {};
  for (const [source, data] of Object.entries(sourceData)) {
    if (data.total === 0) continue;

    const accuracy = data.correct / data.total;
    const edge = accuracy - 0.5; // positive = useful, negative = harmful

    // Correlation between signal strength and P&L
    const strengthCorrelation = pearsonCorrelation(data.strengths, data.pnls);

    scores[source] = {
      accuracy:             parseFloat(accuracy.toFixed(4)),
      strength_correlation: parseFloat(strengthCorrelation.toFixed(4)),
      edge:                 parseFloat(edge.toFixed(4)),
      sample_count:         data.total
    };
  }

  return scores;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core algorithm: Weight adjustment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute new weights from current weights and signal scores.
 *
 * Formula: new_weight = old_weight + (edge * learning_rate * 0.1)
 * Then: clamp to [WEIGHT_MIN, WEIGHT_MAX]
 * Then: cap per-session change at ±MAX_WEIGHT_CHANGE
 * Then: normalize to sum to 1.0
 *
 * @param {object} currentWeights  — { source: weight }
 * @param {object} signalScores    — from scoreSignals()
 * @param {number} learningRate
 * @param {number} totalTrades     — for learning rate decay
 * @returns {{ newWeights, changes, insights }}
 */
function adjustWeights(currentWeights, signalScores, learningRate, totalTrades) {
  const newWeights = { ...currentWeights };
  const changes = {};
  const insights = [];

  for (const source of Object.keys(currentWeights)) {
    const score = signalScores[source];
    if (!score || score.sample_count < 3) continue; // Need 3+ samples to adjust

    const oldWeight = currentWeights[source];
    const delta = score.edge * learningRate * 0.1;

    // Apply delta
    let candidate = oldWeight + delta;

    // Cap per-session change at ±MAX_WEIGHT_CHANGE
    const cappedDelta = clamp(candidate - oldWeight, -MAX_WEIGHT_CHANGE, MAX_WEIGHT_CHANGE);
    candidate = oldWeight + cappedDelta;

    // Clamp to bounds
    const clamped = clamp(candidate, WEIGHT_MIN, WEIGHT_MAX);

    newWeights[source] = clamped;
    const actualChange = clamped - oldWeight;
    changes[source] = parseFloat(actualChange.toFixed(6));

    if (Math.abs(actualChange) >= 0.005) {
      const pct = (score.accuracy * 100).toFixed(0);
      const direction = actualChange > 0 ? 'increasing' : 'reducing';
      insights.push(
        `${source} signal accuracy ${pct}% — ${direction} weight from ` +
        `${oldWeight.toFixed(3)} → ${clamped.toFixed(3)} (edge: ${score.edge >= 0 ? '+' : ''}${score.edge.toFixed(3)})`
      );
    }
  }

  // Normalize all weights to sum to 1.0
  const normalized = normalizeWeights(newWeights);

  // Recompute actual changes post-normalization
  const finalChanges = {};
  for (const source of Object.keys(currentWeights)) {
    const old = currentWeights[source] || 0;
    const nw  = normalized[source] || 0;
    finalChanges[source] = parseFloat((nw - old).toFixed(6));
  }

  return { newWeights: normalized, changes: finalChanges, insights };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core algorithm: Threshold adaptation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapt the betting threshold based on recent win rate.
 *
 * @param {number} currentThreshold
 * @param {number} winRate     — recent win rate (0..1)
 * @param {number} tradeCount  — number of trades used to compute win rate
 * @returns {{ newThreshold, insight }}
 */
function adaptThreshold(currentThreshold, winRate, tradeCount) {
  let newThreshold = currentThreshold;
  let insight = null;

  if (tradeCount >= MIN_TRADES_TO_ADJUST) {
    if (winRate < WIN_RATE_LOW) {
      // Too many losses — be more selective
      newThreshold = currentThreshold + 0.03;
      insight = `Win rate ${(winRate * 100).toFixed(0)}% < ${WIN_RATE_LOW * 100}% — raising threshold ` +
                `from ${currentThreshold.toFixed(3)} → ${Math.min(newThreshold, THRESHOLD_MAX).toFixed(3)}`;
    } else if (winRate > WIN_RATE_HIGH && tradeCount >= WINDOW_SIZE) {
      // Doing well with enough data — take more opportunities
      newThreshold = currentThreshold - 0.02;
      insight = `Win rate ${(winRate * 100).toFixed(0)}% > ${WIN_RATE_HIGH * 100}% — lowering threshold ` +
                `from ${currentThreshold.toFixed(3)} → ${Math.max(newThreshold, THRESHOLD_MIN).toFixed(3)}`;
    }
  }

  newThreshold = clamp(newThreshold, THRESHOLD_MIN, THRESHOLD_MAX);
  return {
    newThreshold: parseFloat(newThreshold.toFixed(4)),
    changed: newThreshold !== currentThreshold,
    insight
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core algorithm: Blackout management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate and update blackout conditions for a model.
 *
 * @param {number} modelId
 * @param {Array}  recentTrades  — last trades (already in time-desc order)
 * @param {number} btcVolatility — abs % change 1h
 * @param {number} fearGreed     — 0..100
 * @returns {{ blackout: boolean, reason: string|null, until: string|null, globalAdjustment: number }}
 */
function evaluateBlackout(modelId, recentTrades, btcVolatility, fearGreed) {
  const state = loadBlackout();
  if (!state.models) state.models = {};
  if (!state.global)  state.global  = {};

  const modelState = state.models[String(modelId)] || {};
  let blackout = false;
  let reason = null;
  let until = null;
  const insights = [];

  // ── Check consecutive losses ──────────────────────────────────────────────
  let consecutiveLosses = 0;
  for (const trade of recentTrades) {
    if (!trade.is_win) {
      consecutiveLosses++;
    } else {
      break; // stop at first win
    }
  }

  if (consecutiveLosses >= CONSECUTIVE_LOSS_TRIGGER) {
    blackout = true;
    const untilDate = new Date(Date.now() + BLACKOUT_DURATION_MS);
    until = untilDate.toISOString();
    reason = `${consecutiveLosses} consecutive losses`;
    insights.push(`Blackout triggered: ${consecutiveLosses} consecutive losses, pausing 30 minutes`);
  }

  // Update model blackout state
  if (blackout) {
    modelState.blackout_until  = until;
    modelState.blackout_reason = reason;
    modelState.consecutive_losses = consecutiveLosses;
  } else {
    // Check if existing blackout has expired
    if (modelState.blackout_until && new Date(modelState.blackout_until) <= new Date()) {
      modelState.blackout_until  = null;
      modelState.blackout_reason = null;
    }
    modelState.consecutive_losses = consecutiveLosses;
  }
  state.models[String(modelId)] = modelState;

  // ── Global conditions (affect all models) ─────────────────────────────────
  let globalConfidenceMultiplier = 1.0;

  // BTC high volatility
  if (btcVolatility != null && btcVolatility > BTC_HIGH_VOLATILITY) {
    globalConfidenceMultiplier = 0.7;
    state.global.high_volatility = true;
    state.global.volatility_pct  = btcVolatility;
    insights.push(`BTC 1h volatility ${btcVolatility.toFixed(2)}% > ${BTC_HIGH_VOLATILITY}% — applying 0.7× confidence multiplier`);
  } else {
    state.global.high_volatility = false;
    state.global.volatility_pct  = btcVolatility;
  }

  // Fear/Greed extremes
  if (fearGreed !== null && fearGreed !== undefined) {
    if (fearGreed < 20) {
      state.global.skip_up_bets  = true;
      state.global.fear_greed    = fearGreed;
      insights.push(`Fear/Greed index ${fearGreed} (extreme fear) — skipping all UP bets`);
    } else if (fearGreed > 80) {
      state.global.skip_down_bets = true;
      state.global.fear_greed     = fearGreed;
      insights.push(`Fear/Greed index ${fearGreed} (extreme greed) — skipping all DOWN bets`);
    } else {
      state.global.skip_up_bets   = false;
      state.global.skip_down_bets = false;
      state.global.fear_greed     = fearGreed;
    }
  }

  saveBlackout(state);

  return {
    blackout,
    reason,
    until,
    consecutiveLosses,
    globalConfidenceMultiplier,
    skipUpBets:   !!state.global.skip_up_bets,
    skipDownBets: !!state.global.skip_down_bets,
    insights
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight storage
// ─────────────────────────────────────────────────────────────────────────────

function storeInsight(modelId, insightText, actionTaken = {}) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO model_insights (model_id, insight_text, action_taken)
      VALUES (?, ?, ?)
    `).run(modelId, insightText, JSON.stringify(actionTaken));
  } catch (err) {
    if (err.message.includes('no such table')) {
      console.warn('[Improver] model_insights table missing. Run schema-v2.sql first.');
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB persistence: save updated model
// ─────────────────────────────────────────────────────────────────────────────

function persistModelUpdates(modelId, newWeights, newThresholds, consecutiveLosses, blackoutUntil) {
  const db = getDb();

  // Build the UPDATE — handle both old schema (no new columns) and new schema gracefully
  try {
    db.prepare(`
      UPDATE models
      SET signal_weights = ?,
          thresholds = ?,
          consecutive_losses = ?,
          blackout_until = ?,
          total_learning_cycles = COALESCE(total_learning_cycles, 0) + 1,
          version = COALESCE(version, 0) + 1
      WHERE id = ?
    `).run(
      JSON.stringify(newWeights),
      JSON.stringify(newThresholds),
      consecutiveLosses,
      blackoutUntil || null,
      modelId
    );
  } catch (err) {
    // If new columns don't exist yet, fall back to basic update
    if (err.message.includes('no such column')) {
      db.prepare(`
        UPDATE models SET signal_weights = ?, thresholds = ? WHERE id = ?
      `).run(JSON.stringify(newWeights), JSON.stringify(newThresholds), modelId);
      console.warn('[Improver] Schema v2 columns missing — saved weights/thresholds only');
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main learning cycle for one model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one full learning cycle for a model.
 *
 * @param {object} model — model row with parsed signal_weights and thresholds
 * @returns {object} cycle result summary
 */
function runLearningCycle(model) {
  console.log(`\n[Improver] ─── Learning cycle: model "${model.name}" (id=${model.id}) ───`);

  // 1. Load recent trades
  const trades = loadRecentTrades(model.id, WINDOW_SIZE);
  if (trades.length < MIN_TRADES_TO_ADJUST) {
    console.log(`[Improver] Only ${trades.length} trades — need ${MIN_TRADES_TO_ADJUST}+ to learn. Skipping.`);
    return { model_id: model.id, skipped: true, reason: 'insufficient_trades', trade_count: trades.length };
  }

  const totalTrades    = trades.length;
  const wins           = trades.filter(t => t.is_win).length;
  const winRate        = wins / totalTrades;
  const learningRate   = computeLearningRate(totalTrades);

  console.log(`[Improver] ${totalTrades} trades, win rate ${(winRate * 100).toFixed(1)}%, lr=${learningRate.toFixed(3)}`);

  // 2. Score signals
  const signalScores = scoreSignals(trades);
  console.log('[Improver] Signal scores:', JSON.stringify(signalScores, null, 2));

  // 3. Adjust weights
  const currentWeights = model.signal_weights;
  const { newWeights, changes, insights: weightInsights } = adjustWeights(
    currentWeights, signalScores, learningRate, totalTrades
  );

  // 4. Adapt threshold
  const currentThreshold = model.thresholds.bet_threshold || 0.65;
  const { newThreshold, changed: thresholdChanged, insight: thresholdInsight } =
    adaptThreshold(currentThreshold, winRate, totalTrades);

  const newThresholds = { ...model.thresholds, bet_threshold: newThreshold };

  // 5. Blackout evaluation
  const btcVolatility = getLatestBtcVolatility();
  const fearGreed     = getLatestFearGreed(model.id);
  const blackoutResult = evaluateBlackout(model.id, trades, btcVolatility, fearGreed);

  // 6. Collect all insights
  const allInsights = [...weightInsights];
  if (thresholdChanged && thresholdInsight) allInsights.push(thresholdInsight);
  allInsights.push(...blackoutResult.insights);

  if (blackoutResult.blackout) {
    allInsights.push(
      `Model raised threshold from ${currentThreshold.toFixed(3)} → ${newThreshold.toFixed(3)} ` +
      `after ${blackoutResult.consecutiveLosses} consecutive losses`
    );
  }

  // 7. Persist
  persistModelUpdates(
    model.id,
    newWeights,
    newThresholds,
    blackoutResult.consecutiveLosses,
    blackoutResult.until
  );

  // 8. Store insights in DB
  for (const insight of allInsights) {
    console.log(`[Improver] 💡 ${insight}`);
    storeInsight(model.id, insight, {
      type:       'learning_cycle',
      win_rate:   winRate,
      trade_count: totalTrades,
      weight_changes: changes
    });
  }

  const summary = {
    model_id:           model.id,
    model_name:         model.name,
    skipped:            false,
    trade_count:        totalTrades,
    win_rate:           parseFloat(winRate.toFixed(4)),
    learning_rate:      parseFloat(learningRate.toFixed(4)),
    signal_scores:      signalScores,
    old_weights:        currentWeights,
    new_weights:        newWeights,
    weight_changes:     changes,
    old_threshold:      currentThreshold,
    new_threshold:      newThreshold,
    threshold_changed:  thresholdChanged,
    blackout:           blackoutResult.blackout,
    blackout_until:     blackoutResult.until,
    blackout_reason:    blackoutResult.reason,
    consecutive_losses: blackoutResult.consecutiveLosses,
    btc_volatility:     btcVolatility,
    fear_greed:         fearGreed,
    global_confidence_multiplier: blackoutResult.globalConfidenceMultiplier,
    skip_up_bets:       blackoutResult.skipUpBets,
    skip_down_bets:     blackoutResult.skipDownBets,
    insights:           allInsights,
    ran_at:             new Date().toISOString()
  };

  console.log(`[Improver] Cycle complete: ${allInsights.length} insights, blackout=${blackoutResult.blackout}`);
  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level: run all models
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full self-improvement cycle across all active models.
 * Called after every 5 trades or once per hour.
 *
 * @returns {Array<object>} results per model
 */
function runImprovementCycle() {
  console.log(`\n[Improver] ══════ Self-Improvement Cycle @ ${new Date().toISOString()} ══════`);

  let models;
  try {
    models = loadModels();
  } catch (err) {
    console.error('[Improver] Could not load models:', err.message);
    return [];
  }

  const results = [];
  for (const model of models) {
    try {
      const result = runLearningCycle(model);
      results.push(result);
    } catch (err) {
      console.error(`[Improver] Error in cycle for model ${model.id}:`, err.message);
      results.push({ model_id: model.id, error: err.message });
    }
  }

  console.log(`\n[Improver] ══════ Cycle complete: ${results.length} models processed ══════\n`);
  return results;
}

/**
 * Run improvement cycle for a single model by ID.
 */
function runForModel(modelId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(modelId);
  if (!row) {
    console.error(`[Improver] Model ${modelId} not found`);
    return null;
  }
  const model = {
    ...row,
    signal_weights: JSON.parse(row.signal_weights || '{}'),
    thresholds:     JSON.parse(row.thresholds || '{}')
  };
  return runLearningCycle(model);
}

/**
 * Called after a trade closes. Checks if we've hit the trigger threshold
 * (every 5 closed trades) and runs a cycle if so.
 *
 * @param {number} modelId
 */
function onTradeClosed(modelId) {
  const db = getDb();
  const countRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM trades
    WHERE model_id = ? AND status IN ('closed','expired')
  `).get(modelId);

  const total = countRow ? countRow.cnt : 0;
  if (total > 0 && total % 5 === 0) {
    console.log(`[Improver] Trade count ${total} — triggering learning cycle for model ${modelId}`);
    return runForModel(modelId);
  }
  return null;
}

module.exports = {
  runImprovementCycle,
  runForModel,
  onTradeClosed,
  scoreSignals,
  adjustWeights,
  adaptThreshold,
  evaluateBlackout,
  computeLearningRate,
  normalizeWeights
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    console.log('[Improver] Module loaded OK — running self-test...');

    // Test math functions
    console.log('\n── Math unit tests ──');

    // computeLearningRate
    console.log(`lr(0 trades)=${computeLearningRate(0).toFixed(4)}   expect=${LEARNING_RATE_BASE}`);
    console.log(`lr(50 trades)=${computeLearningRate(50).toFixed(4)}  expect=0.1500`);
    console.log(`lr(200 trades)=${computeLearningRate(200).toFixed(4)} expect=0.0600`);

    // normalizeWeights
    const testW = { a: 0.3, b: 0.3, c: 0.4 };
    const norm = normalizeWeights(testW);
    const sum = Object.values(norm).reduce((a, b) => a + b, 0);
    console.log(`normalizeWeights sum=${sum.toFixed(6)} (expect ~1.0)`);

    // pearsonCorrelation
    const corr = pearsonCorrelation([1,2,3,4,5], [2,4,6,8,10]);
    console.log(`pearson([1..5],[2..10])=${corr.toFixed(4)} (expect 1.0)`);

    // adaptThreshold
    const { newThreshold: t1, insight: i1 } = adaptThreshold(0.65, 0.40, 20);
    console.log(`adaptThreshold(0.65, 0.40, 20): ${t1} insight="${i1}"`);
    const { newThreshold: t2 } = adaptThreshold(0.65, 0.70, 20);
    console.log(`adaptThreshold(0.65, 0.70, 20): ${t2}`);

    // Try a live cycle (will skip if not enough trades)
    console.log('\n── Live improvement cycle ──');
    try {
      const results = runImprovementCycle();
      console.log(`[Improver] Ran for ${results.length} models`);
      for (const r of results) {
        if (r.skipped) {
          console.log(`  Model ${r.model_id}: skipped (${r.reason}, ${r.trade_count} trades)`);
        } else if (r.error) {
          console.log(`  Model ${r.model_id}: ERROR — ${r.error}`);
        } else {
          console.log(`  Model ${r.model_id} "${r.model_name}": winRate=${(r.win_rate*100).toFixed(1)}%, ${r.insights.length} insights`);
        }
      }
    } catch (err) {
      if (err.message.includes('no such column') || err.message.includes('no such table')) {
        console.log('[Improver] Schema v2 not yet applied — that is expected in test mode.');
        console.log('[Improver] Run: sqlite3 data/poly.db < data/schema-v2.sql');
      } else {
        console.error('[Improver] Error:', err.message);
      }
    }

    console.log('\n[Improver] Self-test complete ✓');

  } else if (args.includes('--run')) {
    runImprovementCycle();
  } else if (args[0] && !isNaN(parseInt(args[0]))) {
    runForModel(parseInt(args[0]));
  } else {
    console.log('Usage: node self-improver.js [--test|--run|<modelId>]');
  }
}
