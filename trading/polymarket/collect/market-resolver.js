'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');
let db;
function getDb() {
  if (!db) { db = new Database(DB_PATH); db.pragma('journal_mode = WAL'); }
  return db;
}

/**
 * Check all open trades and resolve any whose market has settled
 * Called every 30 seconds from start-all.js
 */
async function resolveSettledMarkets() {
  const database = getDb();

  // Get open trades
  const openTrades = database.prepare(`
    SELECT t.*, ms.up_odds, ms.down_odds, ms.time_remaining,
           ms.timestamp as snapshot_ts
    FROM trades t
    JOIN (
      SELECT market_id, up_odds, down_odds, time_remaining, timestamp,
             ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY timestamp DESC) as rn
      FROM market_snapshots WHERE up_odds IS NOT NULL
    ) ms ON ms.market_id = t.market_id AND ms.rn = 1
    WHERE t.status = 'open'
  `).all();

  let resolved = 0;
  for (const trade of openTrades) {
    // Market resolved if time_remaining = 0 AND odds are near 0 or 1
    const timeExpired = trade.time_remaining !== null && trade.time_remaining <= 0;
    const oddsSettled = trade.up_odds !== null && (trade.up_odds >= 0.95 || trade.up_odds <= 0.05);
    const tradeAge = (Date.now() - new Date(trade.opened_at).getTime()) / 1000 / 60; // minutes

    let shouldResolve = false;
    let exitOdds = trade.up_odds;

    if (timeExpired && oddsSettled) {
      shouldResolve = true; // Clean resolution
    } else if (tradeAge > 10 && oddsSettled) {
      shouldResolve = true; // Odds settled even if time_remaining not 0
    } else if (tradeAge > 30) {
      // Force resolve after 30 min regardless
      shouldResolve = true;
      exitOdds = trade.up_odds || 0.5; // Use current odds or 50/50
    }

    if (shouldResolve && exitOdds !== null) {
      // Determine win/loss
      const won = trade.direction === 'up' ? exitOdds >= 0.5 : exitOdds < 0.5;
      const payoutOdds = trade.direction === 'up' ? trade.entry_odds : 1 - trade.entry_odds;
      const pnl = won
        ? trade.amount_usdc * (1 - payoutOdds) / payoutOdds
        : -trade.amount_usdc;

      database.transaction(() => {
        database.prepare(`
          UPDATE trades SET status='closed', exit_odds=?, closed_at=CURRENT_TIMESTAMP, pnl=?,
          notes=COALESCE(notes,'')||' [resolved: '||CASE WHEN ? >= 0.5 THEN 'YES' ELSE 'NO' END||']'
          WHERE id=?
        `).run(exitOdds, pnl, exitOdds, trade.id);

        const ret = trade.amount_usdc + pnl;
        if (ret > 0) {
          database.prepare('UPDATE paper_accounts SET balance_usdc = balance_usdc + ? WHERE model_id = ?')
            .run(ret, trade.model_id);
        }
      })();

      const emoji = pnl > 0 ? '✅' : '❌';
      console.log(`[Resolver] ${emoji} Trade #${trade.id} resolved ${won?'WIN':'LOSS'} P&L: $${pnl.toFixed(3)} | exit: ${exitOdds?.toFixed(3)}`);
      resolved++;
    }
  }

  return resolved;
}

module.exports = { resolveSettledMarkets };

if (require.main === module) {
  resolveSettledMarkets().then(n => console.log(`Resolved ${n} trades`)).catch(console.error);
}
