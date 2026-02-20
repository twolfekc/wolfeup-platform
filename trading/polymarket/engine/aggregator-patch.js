// aggregator-patch.js — Integration guide for aggregator.js
// Shows exactly how to wire in bet-sizer, signal-enhancer, self-improver, and market-pattern.
// Copy the relevant snippets into aggregator.js at the marked locations.
'use strict';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * STEP 1 — Add these requires at the top of aggregator.js
 * ══════════════════════════════════════════════════════════════════════════════
 */
const IMPORTS = `
// ── Self-improvement engine imports (add after existing requires) ──
const { kellyBet, entryOddsToPayoff, shouldSkipTrade } = require('./bet-sizer');
const { runEnhancedSignals }   = require('./signal-enhancer');
const { getMarketEdge }        = require('./market-pattern');
const { onTradeClosed }        = require('./self-improver');
`;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * STEP 2 — Run enhanced signals BEFORE score aggregation
 *
 * In aggregator.js, find the function that gathers signals (likely called
 * aggregateSignals() or similar). BEFORE the final score calculation, add:
 * ══════════════════════════════════════════════════════════════════════════════
 */
const BEFORE_AGGREGATION = `
// ── Enhanced signals (odds movement + volume spike) — run before aggregation ──
// marketId = the current Polymarket market being evaluated
// modelId  = current model's id
const enhancedSignals = runEnhancedSignals(marketId, modelId);

// Merge enhanced signals into the signals array used for aggregation.
// Each signal has: { source, normalized (-1..+1), raw, ... }
// Add them to your existing signals array so they get weighted and averaged:
for (const sig of enhancedSignals) {
  signals.push({
    source:     sig.source,
    normalized: sig.normalized,
    weight:     modelWeights[sig.source] || 0.05  // default low weight for new signals
  });
}
`;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * STEP 3 — Adjust final score with market edge
 *
 * After computing the aggregated score (0..1 or -1..+1), apply the market edge:
 * ══════════════════════════════════════════════════════════════════════════════
 */
const AFTER_SCORE_COMPUTED = `
// ── Market edge adjustment ──
// hourOfDay: new Date().getUTCHours()
// recentVolatility: latest btc change_1h absolute value
const hourOfDay        = new Date().getUTCHours();
const recentVolatility = Math.abs(latestBtcChange1h || 0); // from your BTC data fetch
const edgeScore = getMarketEdge(direction, currentOdds, hourOfDay, recentVolatility);

// Apply edge as a confidence modifier:
// edgeScore 0..1, centered at 0.5 (neutral)
// Multiply aggregated confidence by (edgeScore * 2) → 0x to 2x scaling, capped at 1.0
const edgeMultiplier = Math.min(1.0, edgeScore * 2);
let finalScore = aggregatedScore * edgeMultiplier;

// Apply BTC high-volatility global penalty from blackout state (if active):
const blackoutState = require('../data/blackout.json'); // or load via loadBlackout()
if (blackoutState.global && blackoutState.global.high_volatility) {
  finalScore *= 0.7; // reduce confidence when BTC is very volatile
}

// Global fear/greed blocks
if (blackoutState.global && blackoutState.global.skip_up_bets  && direction === 'up')   return; // skip
if (blackoutState.global && blackoutState.global.skip_down_bets && direction === 'down') return; // skip
`;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * STEP 4 — Replace fixed bet sizing with Kelly Criterion
 *
 * Find where placeBet() is called in aggregator.js. Replace the hardcoded
 * amount with Kelly-sized amount:
 * ══════════════════════════════════════════════════════════════════════════════
 */
const BET_SIZING = `
// ── Kelly Criterion sizing ──
// currentOdds = entry odds (0..1) e.g. up_odds or down_odds from market snapshot
// finalScore  = model's aggregated confidence (0..1) — use as winProbability
// account.balance_usdc = current bankroll
// maxBet = model.thresholds.max_bet

const payoffOdds  = entryOddsToPayoff(currentOdds);  // (1/entry_odds) - 1
const winProb     = finalScore;                        // model confidence as win probability
const bankroll    = account.balance_usdc;
const maxBet      = modelThresholds.max_bet || 10;

// Check if we should skip this trade entirely
const skipCheck = shouldSkipTrade(model.id, currentOdds, direction, {
  balance:         bankroll,
  winProbability:  winProb,
  maxBet:          maxBet,
  edgeScore:       edgeScore         // from market-pattern.js above
});

if (skipCheck.skip) {
  console.log(\`[Aggregator] Skipping trade: \${skipCheck.reason}\`);
  return; // or continue; depending on your loop structure
}

// Kelly gives us the optimal bet size
const betAmount = skipCheck.suggestedBet
  || kellyBet(winProb, payoffOdds, bankroll, maxBet);

// Now place the bet with the Kelly-sized amount
const trade = placeBet(model.id, marketId, direction, betAmount, currentOdds);
`;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * STEP 5 — Trigger learning cycle after a trade closes
 *
 * Find where closeTrade() is called (or where checkExpiredTrades processes results).
 * After each trade closes, call:
 * ══════════════════════════════════════════════════════════════════════════════
 */
const AFTER_TRADE_CLOSES = `
// ── Trigger self-improvement after trade close ──
// closedTrade = the trade object returned by closeTrade() or checkExpiredTrades()
// This will trigger a full learning cycle every 5 closed trades automatically.

if (closedTrade && closedTrade.model_id) {
  // Analyze the individual trade first
  const { analyzeTrade } = require('./analyzer');
  analyzeTrade(closedTrade.id);

  // Then run the learning cycle if threshold is met (every 5 trades)
  onTradeClosed(closedTrade.model_id);
}
`;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * COMPLETE INTEGRATION EXAMPLE
 *
 * Here's a condensed version of what the aggregation + betting flow looks like
 * with all pieces wired together:
 * ══════════════════════════════════════════════════════════════════════════════
 */
function exampleIntegratedFlow(marketId, model, account, currentSnapshot, btcData) {
  const { kellyBet, entryOddsToPayoff, shouldSkipTrade } = require('./bet-sizer');
  const { runEnhancedSignals }   = require('./signal-enhancer');
  const { getMarketEdge }        = require('./market-pattern');
  const { onTradeClosed }        = require('./self-improver');
  const { analyzeTrade }         = require('./analyzer');
  const { placeBet }             = require('./trader');

  const modelWeights   = JSON.parse(model.signal_weights);
  const modelThresholds = JSON.parse(model.thresholds);
  const betThreshold   = modelThresholds.bet_threshold || 0.65;

  // --- Step A: Gather base signals from DB (existing aggregator logic) ---
  // (existing signal fetch code here — produces an array of { source, normalized })
  const baseSignals = []; // ← your existing signal fetch result

  // --- Step B: Add enhanced signals (zero API calls) ---
  const enhanced = runEnhancedSignals(marketId, model.id);
  const allSignals = [...baseSignals, ...enhanced];

  // --- Step C: Weighted aggregate score ---
  let weightedSum = 0;
  let weightTotal = 0;
  for (const sig of allSignals) {
    const w = modelWeights[sig.source] || 0.05;
    weightedSum += sig.normalized * w;
    weightTotal += w;
  }
  const rawScore = weightTotal > 0 ? weightedSum / weightTotal : 0; // -1..+1

  // Convert to 0..1 for threshold comparison
  const confidence = (rawScore + 1) / 2; // 0=full down, 0.5=neutral, 1=full up
  const direction  = rawScore > 0 ? 'up' : 'down';

  // --- Step D: Market edge adjustment ---
  const currentOdds    = direction === 'up' ? currentSnapshot.up_odds : currentSnapshot.down_odds;
  const hourOfDay      = new Date().getUTCHours();
  const btcVolatility  = Math.abs(btcData ? btcData.change_1h || 0 : 0);
  const edgeScore      = getMarketEdge(direction, currentOdds, hourOfDay, btcVolatility);

  // Blend model confidence with market edge (equal weight)
  const finalScore = (confidence * 0.7) + (edgeScore * 0.3);

  // --- Step E: Skip checks ---
  if (finalScore < betThreshold) {
    console.log(`[Flow] Score ${finalScore.toFixed(3)} < threshold ${betThreshold} — skipping`);
    return null;
  }

  const payoffOdds = entryOddsToPayoff(currentOdds);
  const skipCheck  = shouldSkipTrade(model.id, currentOdds, direction, {
    balance:        account.balance_usdc,
    winProbability: finalScore,
    maxBet:         modelThresholds.max_bet || 10,
    edgeScore
  });

  if (skipCheck.skip) {
    console.log(`[Flow] Skipping: ${skipCheck.reason}`);
    return null;
  }

  const betAmount = skipCheck.suggestedBet
    || kellyBet(finalScore, payoffOdds, account.balance_usdc, modelThresholds.max_bet || 10);

  // --- Step F: Place bet ---
  const trade = placeBet(model.id, marketId, direction, betAmount, currentOdds);
  return trade;
}

/**
 * Hook to call after checkExpiredTrades() processes results.
 * Pass all closed trade objects.
 */
function afterTradesClose(closedTrades) {
  const { analyzeTrade } = require('./analyzer');
  const { onTradeClosed } = require('./self-improver');

  for (const trade of closedTrades) {
    if (!trade || !trade.id) continue;
    analyzeTrade(trade.id);
    onTradeClosed(trade.model_id);
  }
}

// Export everything for easy reference
module.exports = {
  IMPORTS,
  BEFORE_AGGREGATION,
  AFTER_SCORE_COMPUTED,
  BET_SIZING,
  AFTER_TRADE_CLOSES,
  exampleIntegratedFlow,
  afterTradesClose
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI: Print integration guide
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  console.log('══════════════════════════════════════════════');
  console.log('  aggregator.js Integration Guide');
  console.log('══════════════════════════════════════════════\n');
  console.log('STEP 1 — Add imports:\n', IMPORTS);
  console.log('STEP 2 — Before aggregation:\n', BEFORE_AGGREGATION);
  console.log('STEP 3 — After score computed:\n', AFTER_SCORE_COMPUTED);
  console.log('STEP 4 — Kelly bet sizing:\n', BET_SIZING);
  console.log('STEP 5 — After trade closes:\n', AFTER_TRADE_CLOSES);
}
