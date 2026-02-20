// aggregator.js — Signal aggregation and trade decision engine
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const { placeBet, checkExpiredTrades } = require('./trader');
const { sendTelegram } = require('../collect/send-telegram');

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

/**
 * Get the latest signal value for a given source within a time window
 */
function getLatestSignal(database, modelId, source, withinMinutes) {
  const row = database.prepare(`
    SELECT normalized, raw_value, timestamp, metadata
    FROM signals
    WHERE model_id = ?
    AND source = ?
    AND timestamp >= datetime('now', ? || ' minutes')
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(modelId, source, `-${withinMinutes}`);
  return row || null;
}

/**
 * Run signal aggregation for a single model
 */
async function runForModel(modelId) {
  const database = getDb();

  const model = database.prepare('SELECT * FROM models WHERE id = ?').get(modelId);
  if (!model) return;

  const weights = JSON.parse(model.signal_weights || '{}');
  const thresholds = JSON.parse(model.thresholds || '{}');
  const betThreshold = thresholds.bet_threshold || 0.65;
  const maxBet = thresholds.max_bet || 10;

  // Signal time windows
  const shortTermSources = ['price_momentum', 'fear_greed', 'volume'];
  const longTermSources = ['news_sentiment', 'x_sentiment', 'poly_odds'];
  const SHORT_WIN = 30;  // minutes
  const LONG_WIN = 120;  // minutes

  let weightedSum = 0;
  let totalWeight = 0;
  const sourcesUsed = [];
  const signalDetails = [];

  // Short-term signals
  for (const source of shortTermSources) {
    const signal = getLatestSignal(database, modelId, source, SHORT_WIN);
    const weight = weights[source] || 0;
    if (signal && weight > 0) {
      weightedSum += signal.normalized * weight;
      totalWeight += weight;
      sourcesUsed.push(source);
      signalDetails.push({ source, value: signal.normalized, weight, contribution: signal.normalized * weight });
    }
  }

  // Long-term signals
  for (const source of longTermSources) {
    const signal = getLatestSignal(database, modelId, source, LONG_WIN);
    const weight = weights[source] || 0;
    if (signal && weight > 0) {
      weightedSum += signal.normalized * weight;
      totalWeight += weight;
      sourcesUsed.push(source);
      signalDetails.push({ source, value: signal.normalized, weight, contribution: signal.normalized * weight });
    }
  }

  // No signals available
  if (totalWeight === 0) {
    console.log(`[Aggregator] Model "${model.name}" (${modelId}): No signals available`);
    return;
  }

  // Normalize score by actual total weight used (not full weight)
  const aggregatedScore = Math.max(-1, Math.min(1, weightedSum / totalWeight));

  // Determine direction
  let direction;
  if (aggregatedScore > 0.1) direction = 'up';
  else if (aggregatedScore < -0.1) direction = 'down';
  else direction = 'hold';

  // Determine confidence
  const absScore = Math.abs(aggregatedScore);
  let confidence;
  if (absScore > 0.7) confidence = 'high';
  else if (absScore > 0.4) confidence = 'medium';
  else confidence = 'low';

  // Determine action
  let actionTaken = 'skip';
  if (Math.abs(aggregatedScore) > betThreshold && confidence !== 'low' && direction !== 'hold') {
    actionTaken = 'bet';
  } else if (confidence === 'high') {
    actionTaken = 'alert';
  }

  // Build reasoning string
  const topSignals = signalDetails
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map(s => `${s.source}=${s.value.toFixed(2)}(w:${s.weight})`)
    .join(', ');

  const reasoning = `Score: ${aggregatedScore.toFixed(3)}. Top signals: [${topSignals}]. ${direction.toUpperCase()} bias with ${confidence} confidence.`;

  // Insert signal run
  const runResult = database.prepare(`
    INSERT INTO signal_runs (model_id, aggregated_score, direction, confidence, reasoning, sources_used, action_taken)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    modelId,
    aggregatedScore,
    direction,
    confidence,
    reasoning,
    JSON.stringify(sourcesUsed),
    actionTaken
  );

  console.log(`[Aggregator] Model "${model.name}": score=${aggregatedScore.toFixed(3)} dir=${direction} conf=${confidence} action=${actionTaken}`);

  // Execute bet if warranted
  let tradeResult = null;
  if (actionTaken === 'bet') {
    // Find best available market
    const latestMarket = database.prepare(`
      SELECT market_id, market_name, up_odds, down_odds
      FROM market_snapshots
      WHERE timestamp >= datetime('now', '-5 minutes')
      AND market_id != 'btc-5min-placeholder'
      ORDER BY timestamp DESC
      LIMIT 1
    `).get();

    if (latestMarket) {
      const entryOdds = direction === 'up' ? latestMarket.up_odds : latestMarket.down_odds;
      const account = database.prepare(
        'SELECT balance_usdc FROM paper_accounts WHERE model_id = ?'
      ).get(modelId);

      // Bet size: proportional to confidence, capped at max_bet
      const confidenceMultiplier = confidence === 'high' ? 1.0 : 0.6;
      const betAmount = Math.min(maxBet * confidenceMultiplier, account ? account.balance_usdc * 0.1 : 1);

      if (betAmount >= 0.01) {
        tradeResult = placeBet(modelId, latestMarket.market_id, direction, betAmount, entryOdds || 0.5);
      }
    } else {
      console.log(`[Aggregator] Model "${model.name}" wants to bet but no active market found`);
      actionTaken = 'alert';
      // Update the action_taken in DB
      database.prepare('UPDATE signal_runs SET action_taken = ? WHERE id = ?').run('alert', runResult.lastInsertRowid);
    }
  }

  // Send Telegram alert for high confidence OR new bet
  if (confidence === 'high' || tradeResult) {
    const emoji = direction === 'up' ? '📈' : direction === 'down' ? '📉' : '➡️';
    const actionEmoji = tradeResult ? '🎰' : confidence === 'high' ? '⚠️' : '📊';

    let msg = `${actionEmoji} <b>Polymarket Signal — ${model.name}</b>\n\n`;
    msg += `${emoji} Direction: <b>${direction.toUpperCase()}</b> | Confidence: <b>${confidence.toUpperCase()}</b>\n`;
    msg += `📊 Score: ${aggregatedScore.toFixed(3)} (threshold: ${betThreshold})\n`;
    msg += `📡 Signals: ${sourcesUsed.join(', ')}\n`;
    msg += `\n💭 ${reasoning}\n`;

    if (tradeResult) {
      msg += `\n🎰 <b>PAPER BET PLACED</b>\n`;
      msg += `  Amount: $${tradeResult.amount_usdc.toFixed(2)} USDC\n`;
      msg += `  Market: ${tradeResult.market_name || tradeResult.market_id}\n`;
      msg += `  Entry odds: ${(tradeResult.entry_odds || 0).toFixed(3)}\n`;
    }

    try {
      await sendTelegram(msg);
    } catch (e) {
      console.error('[Aggregator] Telegram error:', e.message);
    }
  }

  return { score: aggregatedScore, direction, confidence, action: actionTaken, trade: tradeResult };
}

/**
 * Run aggregation for all active models
 */
async function runAll() {
  const database = getDb();
  const models = database.prepare('SELECT id, name FROM models WHERE is_active = 1').all();

  console.log(`[Aggregator] ${new Date().toISOString()} Running for ${models.length} active models...`);

  // Check and close expired trades first
  checkExpiredTrades();

  for (const model of models) {
    try {
      await runForModel(model.id);
    } catch (err) {
      console.error(`[Aggregator] Error for model "${model.name}":`, err.message);
    }
  }
}

module.exports = { runAll, runForModel };

if (require.main === module) {
  console.log('[Aggregator] Starting aggregator (5min interval)...');
  runAll();
  setInterval(runAll, 5 * 60 * 1000);
}
