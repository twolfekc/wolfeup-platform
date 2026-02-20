// trader.js — Paper trading engine
'use strict';

const Database = require('better-sqlite3');
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

/**
 * Calculate P&L for a binary prediction market trade.
 * @param {'up'|'down'} direction
 * @param {number} amount - stake in USDC
 * @param {number} entryOdds - implied probability at bet time (0..1)
 * @param {number|null} exitOdds - final up_odds value at resolution (0..1)
 * @returns {number} P&L (positive = profit, negative = loss, 0 = push)
 */
function calculatePnl(direction, amount, entryOdds, exitOdds) {
  if (exitOdds === null || exitOdds === undefined) return 0; // push — no data

  let won;
  let payoutOdds; // implied probability for the side we bet on

  if (direction === 'up') {
    won = exitOdds >= 0.5;   // market resolved mostly YES
    payoutOdds = entryOdds;  // we bet YES at this implied prob
  } else {
    // DOWN bet = betting on NO = betting at (1 - up_odds)
    won = exitOdds < 0.5;       // market resolved mostly NO
    payoutOdds = 1 - entryOdds; // our implied prob for DOWN/NO
  }

  if (payoutOdds <= 0 || payoutOdds >= 1) return 0;

  if (won) {
    // Profit = stake * (1 - payoutOdds) / payoutOdds  [= stake * (1/p - 1)]
    return amount * (1 - payoutOdds) / payoutOdds;
  } else {
    return -amount; // lose entire stake
  }
}

/**
 * Place a paper bet
 * @param {number} modelId
 * @param {string} marketId
 * @param {'up'|'down'} direction
 * @param {number} amount - USDC amount to bet
 * @param {number} entryOdds - 0..1 (e.g. 0.6 = 60% implied prob)
 * @returns {object|null} trade row or null on failure
 */
function placeBet(modelId, marketId, direction, amount, entryOdds) {
  const database = getDb();

  // Get current balance
  const account = database.prepare(
    'SELECT id, balance_usdc FROM paper_accounts WHERE model_id = ?'
  ).get(modelId);

  if (!account) {
    console.error(`[Trader] No paper account for model ${modelId}`);
    return null;
  }

  if (account.balance_usdc < amount) {
    console.warn(`[Trader] Insufficient balance for model ${modelId}: $${account.balance_usdc} < $${amount}`);
    amount = Math.max(0.01, account.balance_usdc * 0.5); // Bet up to 50% of remaining
    if (amount < 0.01) return null;
  }

  // Get market name from latest snapshot
  const snapshot = database.prepare(
    'SELECT market_name FROM market_snapshots WHERE market_id = ? ORDER BY timestamp DESC LIMIT 1'
  ).get(marketId);

  const marketName = snapshot ? snapshot.market_name : marketId;

  // Deduct from balance and insert trade
  const result = database.transaction(() => {
    database.prepare(
      'UPDATE paper_accounts SET balance_usdc = balance_usdc - ? WHERE model_id = ?'
    ).run(amount, modelId);

    const info = database.prepare(`
      INSERT INTO trades (model_id, market_id, market_name, direction, amount_usdc, entry_odds, status)
      VALUES (?, ?, ?, ?, ?, ?, 'open')
    `).run(modelId, marketId, marketName, direction, amount, entryOdds);

    return database.prepare('SELECT * FROM trades WHERE id = ?').get(info.lastInsertRowid);
  })();

  console.log(`[Trader] Placed $${amount} ${direction.toUpperCase()} bet on "${marketName}" @ ${entryOdds} (trade #${result.id}, model ${modelId})`);
  return result;
}

/**
 * Close a trade at given exit odds
 * @param {number} tradeId
 * @param {number} exitOdds - 0..1
 * @returns {object|null} updated trade
 */
function closeTrade(tradeId, exitOdds) {
  const database = getDb();

  const trade = database.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  if (!trade) {
    console.error(`[Trader] Trade ${tradeId} not found`);
    return null;
  }
  if (trade.status !== 'open') {
    console.warn(`[Trader] Trade ${tradeId} is already ${trade.status}`);
    return null;
  }

  // P&L calculation for binary prediction markets:
  // exitOdds = final up_odds value (0..1)
  // UP bet: wins if market resolves YES (exitOdds >= 0.5)
  // DOWN bet: wins if market resolves NO (exitOdds < 0.5)
  // Payout on win: stake * (1 - payoutOdds) / payoutOdds
  // Loss: -stake
  const pnl = calculatePnl(trade.direction, trade.amount_usdc, trade.entry_odds, exitOdds);

  const result = database.transaction(() => {
    database.prepare(`
      UPDATE trades
      SET status = 'closed', exit_odds = ?, closed_at = CURRENT_TIMESTAMP, pnl = ?
      WHERE id = ?
    `).run(exitOdds, pnl, tradeId);

    // Add back amount + pnl to balance
    const returnAmount = trade.amount_usdc + pnl;
    if (returnAmount > 0) {
      database.prepare(
        'UPDATE paper_accounts SET balance_usdc = balance_usdc + ? WHERE model_id = ?'
      ).run(returnAmount, trade.model_id);
    }

    return database.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  })();

  const emoji = pnl >= 0 ? '✅' : '❌';
  console.log(`[Trader] ${emoji} Closed trade #${tradeId} | P&L: $${pnl.toFixed(4)} | Exit odds: ${exitOdds}`);
  return result;
}

/**
 * Find and close expired trades using latest market snapshot odds
 */
function checkExpiredTrades() {
  const database = getDb();

  // Find open trades where market has time_remaining = 0 in latest snapshot
  const expiredTrades = database.prepare(`
    SELECT t.*, ms.up_odds, ms.down_odds, ms.time_remaining
    FROM trades t
    JOIN (
      SELECT market_id, up_odds, down_odds, time_remaining,
             ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY timestamp DESC) as rn
      FROM market_snapshots
    ) ms ON ms.market_id = t.market_id AND ms.rn = 1
    WHERE t.status = 'open'
    AND (ms.time_remaining = 0 OR ms.time_remaining IS NULL)
    AND t.opened_at < datetime('now', '-5 minutes')
  `).all();

  let closed = 0;
  for (const trade of expiredTrades) {
    // Use up_odds as the final resolution value (exitOdds for calculatePnl)
    const exitOdds = (trade.up_odds !== null && trade.up_odds !== undefined)
      ? trade.up_odds
      : null; // null → push (no data)

    const pnl = calculatePnl(trade.direction, trade.amount_usdc, trade.entry_odds, exitOdds);

    database.transaction(() => {
      database.prepare(`
        UPDATE trades
        SET status = 'expired', exit_odds = ?, closed_at = CURRENT_TIMESTAMP, pnl = ?,
            notes = COALESCE(notes, '') || ' [auto-expired]'
        WHERE id = ?
      `).run(exitOdds, pnl, trade.id);

      const returnAmount = trade.amount_usdc + pnl;
      if (returnAmount > 0) {
        database.prepare(
          'UPDATE paper_accounts SET balance_usdc = balance_usdc + ? WHERE model_id = ?'
        ).run(returnAmount, trade.model_id);
      }
    })();

    console.log(`[Trader] Auto-expired trade #${trade.id} | P&L: $${pnl.toFixed(4)}`);
    closed++;
  }

  // Also close trades that have been open > 30 min (stuck/no snapshot)
  const stuckTrades = database.prepare(`
    SELECT * FROM trades
    WHERE status = 'open'
    AND opened_at < datetime('now', '-30 minutes')
  `).all();

  for (const trade of stuckTrades) {
    database.transaction(() => {
      database.prepare(`
        UPDATE trades
        SET status = 'expired', exit_odds = entry_odds, closed_at = CURRENT_TIMESTAMP, pnl = 0,
            notes = COALESCE(notes, '') || ' [expired-no-data]'
        WHERE id = ?
      `).run(trade.id);
      // Return original amount (break-even on no data)
      database.prepare(
        'UPDATE paper_accounts SET balance_usdc = balance_usdc + ? WHERE model_id = ?'
      ).run(trade.amount_usdc, trade.model_id);
    })();

    console.log(`[Trader] Expired stuck trade #${trade.id} (no market data)`);
    closed++;
  }

  if (closed > 0) {
    console.log(`[Trader] Expired ${closed} total trades`);
  }

  return closed;
}

/**
 * Get comprehensive stats for a model
 * @param {number} modelId
 * @returns {object} stats
 */
function getModelStats(modelId) {
  const database = getDb();

  const account = database.prepare(
    'SELECT balance_usdc, starting_balance FROM paper_accounts WHERE model_id = ?'
  ).get(modelId) || { balance_usdc: 100, starting_balance: 100 };

  const trades = database.prepare(
    "SELECT * FROM trades WHERE model_id = ? AND status != 'open' ORDER BY closed_at DESC"
  ).all(modelId);

  const openTrades = database.prepare(
    "SELECT COUNT(*) as count FROM trades WHERE model_id = ? AND status = 'open'"
  ).get(modelId);

  const totalTrades = trades.length;
  const wins = trades.filter(t => (t.pnl || 0) > 0).length;
  const losses = trades.filter(t => (t.pnl || 0) < 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;

  const roiPct = account.starting_balance > 0
    ? ((account.balance_usdc - account.starting_balance) / account.starting_balance) * 100
    : 0;

  const bestTrade = trades.reduce((best, t) => (!best || (t.pnl || 0) > (best.pnl || 0)) ? t : best, null);
  const worstTrade = trades.reduce((worst, t) => (!worst || (t.pnl || 0) < (worst.pnl || 0)) ? t : worst, null);

  // Compute current streak (consecutive wins or losses)
  let currentStreak = 0;
  let streakType = null;
  for (const trade of trades) {
    const won = (trade.pnl || 0) > 0;
    if (streakType === null) {
      streakType = won ? 'win' : 'loss';
      currentStreak = 1;
    } else if ((won && streakType === 'win') || (!won && streakType === 'loss')) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    balance: account.balance_usdc,
    starting_balance: account.starting_balance,
    total_trades: totalTrades,
    open_trades: openTrades ? openTrades.count : 0,
    wins,
    losses,
    win_rate: winRate,
    avg_pnl: avgPnl,
    total_pnl: totalPnl,
    roi_pct: roiPct,
    best_trade: bestTrade ? { id: bestTrade.id, pnl: bestTrade.pnl, direction: bestTrade.direction } : null,
    worst_trade: worstTrade ? { id: worstTrade.id, pnl: worstTrade.pnl, direction: worstTrade.direction } : null,
    current_streak: currentStreak,
    streak_type: streakType
  };
}

module.exports = { placeBet, closeTrade, checkExpiredTrades, getModelStats };
