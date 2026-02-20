// bet-sizer.js — Kelly Criterion position sizing + trade skip logic
'use strict';

const fs   = require('fs');
const path = require('path');

const BLACKOUT_PATH   = path.join(__dirname, '..', 'data', 'blackout.json');
const MIN_BET         = 1.0;
const KELLY_FRACTION  = 0.25;
const MIN_BALANCE     = 10.0;
const MIN_EDGE_SCORE  = 0.30;

/**
 * Kelly Criterion bet sizing (quarter-Kelly).
 *
 * Formula:
 *   f* = (p * b - q) / b   where q = 1 - p
 *   fractional = f* * KELLY_FRACTION (0.25)
 *   bet = bankroll * fractional, clamped to [MIN_BET, maxBet]
 *
 * @param {number} winProbability  0..1  model confidence
 * @param {number} payoffOdds      net decimal odds = (1/entry_odds) - 1
 * @param {number} bankroll        current balance USDC
 * @param {number} maxBet          hard cap
 * @returns {number} bet amount USDC
 */
function kellyBet(winProbability, payoffOdds, bankroll, maxBet) {
  if (winProbability <= 0 || winProbability >= 1) {
    console.warn(`[BetSizer] Invalid winProbability: ${winProbability}`);
    return MIN_BET;
  }
  if (payoffOdds <= 0) {
    console.warn(`[BetSizer] Invalid payoffOdds: ${payoffOdds}`);
    return MIN_BET;
  }
  if (bankroll <= 0) return 0;

  const p = winProbability;
  const q = 1 - p;
  const b = payoffOdds;

  // Kelly fraction: (p*b - q) / b  ≡  p - q/b
  const kelly_fraction = (p * b - q) / b;

  if (kelly_fraction <= 0) {
    console.log(`[BetSizer] Kelly ≤ 0 (${kelly_fraction.toFixed(4)}) — no edge`);
    return 0;
  }

  const fractional_kelly = kelly_fraction * KELLY_FRACTION;
  const raw_bet   = bankroll * fractional_kelly;
  const actual    = Math.min(Math.max(raw_bet, MIN_BET), maxBet);
  const final_bet = Math.min(actual, bankroll);

  console.log(
    `[BetSizer] p=${p.toFixed(3)} b=${b.toFixed(3)} f*=${kelly_fraction.toFixed(4)} ` +
    `qK=${fractional_kelly.toFixed(4)} → $${final_bet.toFixed(2)}`
  );

  return parseFloat(final_bet.toFixed(2));
}

/**
 * Convert entry odds (implied prob 0..1) to net decimal payoff odds.
 *   entry_odds=0.4 → payoff=(1/0.4)-1=1.5  (win $1.50 per $1 risked)
 */
function entryOddsToPayoff(entryOdds) {
  if (entryOdds <= 0 || entryOdds >= 1) return 1.0;
  return (1 / entryOdds) - 1;
}

function loadBlackout() {
  try {
    if (fs.existsSync(BLACKOUT_PATH)) return JSON.parse(fs.readFileSync(BLACKOUT_PATH, 'utf8'));
  } catch (_) {}
  return { models: {}, global: {} };
}

function isInBlackout(modelId) {
  const state = loadBlackout();
  const m = state.models[String(modelId)];
  if (!m || !m.blackout_until) return false;
  return Date.now() < new Date(m.blackout_until).getTime();
}

function getBlackoutUntil(modelId) {
  const state = loadBlackout();
  const m = state.models[String(modelId)];
  return (m && m.blackout_until) ? m.blackout_until : null;
}

/**
 * Decide whether to skip a trade.
 *
 * @param {number}       modelId
 * @param {number}       currentOdds   0..1
 * @param {'up'|'down'}  direction
 * @param {object}       opts  { balance, winProbability, maxBet, edgeScore }
 * @returns {{ skip: boolean, reason: string, suggestedBet?: number }}
 */
function shouldSkipTrade(modelId, currentOdds, direction, opts = {}) {
  const { balance = 100, winProbability = 0.5, maxBet = 10, edgeScore = 0.5 } = opts;

  if (isInBlackout(modelId)) {
    return { skip: true, reason: `Model ${modelId} in blackout until ${getBlackoutUntil(modelId)}` };
  }
  if (balance < MIN_BALANCE) {
    return { skip: true, reason: `Balance $${balance.toFixed(2)} < minimum $${MIN_BALANCE}` };
  }
  if (edgeScore < MIN_EDGE_SCORE) {
    return { skip: true, reason: `Market edge ${edgeScore.toFixed(3)} < minimum ${MIN_EDGE_SCORE}` };
  }

  const payoff = entryOddsToPayoff(currentOdds);
  const bet    = kellyBet(winProbability, payoff, balance, maxBet);
  if (bet < MIN_BET) {
    return { skip: true, reason: `Kelly bet $${bet.toFixed(2)} < minimum $${MIN_BET}` };
  }

  return { skip: false, reason: 'OK', suggestedBet: bet };
}

module.exports = {
  kellyBet,
  entryOddsToPayoff,
  shouldSkipTrade,
  isInBlackout,
  getBlackoutUntil,
  MIN_BET,
  KELLY_FRACTION,
  MIN_BALANCE,
  MIN_EDGE_SCORE
};

if (require.main === module) {
  console.log('[BetSizer] Self-test:');

  // Test 1: edge case — p=0.6, odds=0.45
  // payoff = (1/0.45)-1 = 1.2222
  // f* = (0.6*1.2222 - 0.4)/1.2222 = (0.7333-0.4)/1.2222 = 0.3333/1.2222 = 0.2727
  // qK  = 0.2727 * 0.25 = 0.0682
  // bet = 100 * 0.0682 = $6.82
  const p1 = entryOddsToPayoff(0.45);
  const b1 = kellyBet(0.60, p1, 100, 20);
  console.log(`Test 1 (p=0.60 odds=0.45 bank=$100 max=$20): $${b1}  [expect ~$6.82]`);

  // Test 2: no edge (p=0.5 fair odds)
  // f* = (0.5*1 - 0.5)/1 = 0  → return 0
  const p2 = entryOddsToPayoff(0.50);
  const b2 = kellyBet(0.50, p2, 100, 20);
  console.log(`Test 2 (p=0.50 fair odds): $${b2}  [expect 0]`);

  // Test 3: negative edge
  const p3 = entryOddsToPayoff(0.50);
  const b3 = kellyBet(0.40, p3, 100, 20);
  console.log(`Test 3 (p=0.40 neg edge): $${b3}  [expect 0]`);

  // Test 4: max cap
  // p=0.9, odds=0.30 → payoff=2.333
  // f* = (0.9*2.333-0.1)/2.333 = (2.1-0.1)/2.333 = 2.0/2.333 = 0.857
  // qK = 0.857*0.25 = 0.214, bet=$21.4 → capped at $15
  const p4 = entryOddsToPayoff(0.30);
  const b4 = kellyBet(0.90, p4, 100, 15);
  console.log(`Test 4 (p=0.90 odds=0.30 max=$15): $${b4}  [expect $15]`);

  // Test 5: shouldSkipTrade
  const s1 = shouldSkipTrade(99, 0.5, 'up', { balance: 5, winProbability: 0.6, maxBet: 10, edgeScore: 0.5 });
  console.log(`Test 5 (low balance): skip=${s1.skip}  "${s1.reason}"`);

  const s2 = shouldSkipTrade(99, 0.5, 'up', { balance: 100, winProbability: 0.6, maxBet: 10, edgeScore: 0.2 });
  console.log(`Test 6 (low edge): skip=${s2.skip}  "${s2.reason}"`);

  const s3 = shouldSkipTrade(99, 0.45, 'up', { balance: 100, winProbability: 0.60, maxBet: 10, edgeScore: 0.5 });
  console.log(`Test 7 (all OK): skip=${s3.skip}  bet=$${s3.suggestedBet}`);
}
