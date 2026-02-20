// version-manager.js — Model version tracking and Sharpe ratio analysis
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

// ─── Schema migration ───────────────────────────────────────────────────────

function ensureVersionsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      version_num INTEGER NOT NULL,
      parent_version_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      mutation_reason TEXT,
      signal_weights TEXT NOT NULL,
      thresholds TEXT NOT NULL,
      is_prod_synced INTEGER DEFAULT 0,
      FOREIGN KEY (model_id) REFERENCES models(id)
    )
  `).run();

  // Also ensure model_insights and trade_analyses tables exist
  db.prepare(`
    CREATE TABLE IF NOT EXISTS model_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      insight_text TEXT NOT NULL,
      action_taken TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS trade_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL,
      model_id INTEGER NOT NULL,
      verdict TEXT,
      signal_contributions TEXT,
      adjustment_suggestions TEXT,
      market_conditions TEXT,
      analyzed_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// ─── Math helpers ────────────────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Annualized Sharpe ratio (daily proxy: sqrt(252) multiplier)
 * Requires min 3 trades.
 */
function sharpeRatio(pnlArr) {
  if (!pnlArr || pnlArr.length < 3) return null;
  const m = mean(pnlArr);
  const sd = stddev(pnlArr);
  if (sd === 0) return m > 0 ? 999 : 0;
  return (m / sd) * Math.sqrt(252);
}

/**
 * Maximum drawdown from a series of running balances.
 */
function maxDrawdown(balances) {
  if (!balances || balances.length < 2) return 0;
  let peak = balances[0];
  let maxDD = 0;
  for (const b of balances) {
    if (b > peak) peak = b;
    const dd = peak > 0 ? (peak - b) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ─── Version operations ─────────────────────────────────────────────────────

/**
 * createVersion(modelId, reason, oldWeights, newWeights, oldThreshold, newThreshold)
 * Creates a new version snapshot and returns the version ID.
 */
function createVersion(modelId, reason, oldWeights, newWeights, oldThreshold, newThreshold) {
  const db = getDb();
  ensureVersionsTable(db);

  // Find current max version for this model
  const latest = db.prepare(
    'SELECT id, version_num FROM versions WHERE model_id = ? ORDER BY version_num DESC LIMIT 1'
  ).get(modelId);
  const newVersionNum = latest ? latest.version_num + 1 : 1;
  const parentId = latest ? latest.id : null;

  // Merge old + new thresholds into threshold objects
  const oldThresholds = typeof oldThreshold === 'object' ? oldThreshold : { bet_threshold: oldThreshold };
  const newThresholds = typeof newThreshold === 'object' ? newThreshold : { bet_threshold: newThreshold };

  const result = db.prepare(`
    INSERT INTO versions (model_id, version_num, parent_version_id, mutation_reason, signal_weights, thresholds)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    modelId,
    newVersionNum,
    parentId,
    reason || 'weight_update',
    JSON.stringify(newWeights || oldWeights),
    JSON.stringify(newThresholds || oldThresholds)
  );

  console.log(`[VersionManager] Model ${modelId}: created version ${newVersionNum} (id=${result.lastInsertRowid}) — ${reason}`);
  return result.lastInsertRowid;
}

/**
 * seedV1(modelId) — Seeds initial version v1 from model's current weights.
 * Only creates if no versions exist yet for this model.
 */
function seedV1(modelId) {
  const db = getDb();
  ensureVersionsTable(db);

  const existing = db.prepare('SELECT COUNT(*) as cnt FROM versions WHERE model_id = ?').get(modelId);
  if (existing.cnt > 0) return null; // Already seeded

  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(modelId);
  if (!model) return null;

  const weights = JSON.parse(model.signal_weights || '{}');
  const thresholds = JSON.parse(model.thresholds || '{}');

  const result = db.prepare(`
    INSERT INTO versions (model_id, version_num, parent_version_id, mutation_reason, signal_weights, thresholds)
    VALUES (?, 1, NULL, 'initial', ?, ?)
  `).run(modelId, JSON.stringify(weights), JSON.stringify(thresholds));

  console.log(`[VersionManager] Model ${modelId}: seeded v1 (id=${result.lastInsertRowid})`);
  return result.lastInsertRowid;
}

/**
 * getVersionHistory(modelId) → array of versions with stats
 */
function getVersionHistory(modelId) {
  const db = getDb();
  ensureVersionsTable(db);

  const versions = db.prepare(`
    SELECT * FROM versions WHERE model_id = ? ORDER BY version_num ASC
  `).all(modelId);

  return versions.map((v, i) => {
    const stats = getVersionStats(v.id);
    return {
      id: v.id,
      version_num: v.version_num,
      created_at: v.created_at,
      mutation_reason: v.mutation_reason,
      weights: JSON.parse(v.signal_weights || '{}'),
      threshold: JSON.parse(v.thresholds || '{}'),
      is_prod_synced: !!v.is_prod_synced,
      ...stats,
    };
  });
}

/**
 * getBestVersion(modelId) → version with best Sharpe ratio (min 20 trades)
 */
function getBestVersion(modelId) {
  const history = getVersionHistory(modelId);
  const qualified = history.filter(v => v.total_trades >= 20);
  if (!qualified.length) return null;
  return qualified.reduce((best, v) => {
    const s = v.sharpe_ratio || -Infinity;
    const bs = best.sharpe_ratio || -Infinity;
    return s > bs ? v : best;
  });
}

/**
 * getVersionStats(versionId) — Compute stats for trades during this version's active period.
 */
function getVersionStats(versionId) {
  const db = getDb();
  ensureVersionsTable(db);

  const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId);
  if (!version) return null;

  // Find next version's created_at to define the active window
  const nextVersion = db.prepare(`
    SELECT created_at FROM versions
    WHERE model_id = ? AND version_num > ?
    ORDER BY version_num ASC LIMIT 1
  `).get(version.model_id, version.version_num);

  let tradesQuery;
  let trades;

  if (nextVersion) {
    trades = db.prepare(`
      SELECT t.*, t.pnl, t.opened_at, t.closed_at, t.amount_usdc
      FROM trades t
      WHERE t.model_id = ?
        AND t.status != 'open'
        AND t.opened_at >= ?
        AND t.opened_at < ?
      ORDER BY t.closed_at ASC
    `).all(version.model_id, version.created_at, nextVersion.created_at);
  } else {
    // Latest version: from created_at to now
    trades = db.prepare(`
      SELECT t.*, t.pnl, t.opened_at, t.closed_at, t.amount_usdc
      FROM trades t
      WHERE t.model_id = ?
        AND t.status != 'open'
        AND t.opened_at >= ?
      ORDER BY t.closed_at ASC
    `).all(version.model_id, version.created_at);
  }

  if (!trades.length) {
    return {
      total_trades: 0, wins: 0, losses: 0, win_rate: 0,
      total_pnl: 0, roi_pct: 0, avg_pnl: 0,
      max_drawdown: 0, sharpe_ratio: null,
      consecutive_wins: 0, consecutive_losses: 0,
      balance: null,
    };
  }

  const pnls = trades.map(t => t.pnl || 0);
  const wins = pnls.filter(p => p > 0).length;
  const losses = pnls.filter(p => p <= 0).length;
  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const avgPnl = mean(pnls);
  const winRate = trades.length > 0 ? wins / trades.length : 0;

  // Running balance (start from paper account starting balance)
  const account = db.prepare('SELECT starting_balance, balance_usdc FROM paper_accounts WHERE model_id = ?').get(version.model_id);
  const startBalance = account ? account.starting_balance : 100;
  let runningBalance = startBalance;
  const balances = [startBalance];
  for (const p of pnls) {
    runningBalance += p;
    balances.push(runningBalance);
  }

  // ROI: total_pnl / start_balance
  const roiPct = startBalance > 0 ? (totalPnl / startBalance) * 100 : 0;

  // Consecutive wins/losses at end of sequence
  let consecWins = 0, consecLosses = 0;
  for (let i = pnls.length - 1; i >= 0; i--) {
    if (i === pnls.length - 1) {
      if (pnls[i] > 0) consecWins = 1;
      else consecLosses = 1;
    } else {
      if (consecWins > 0 && pnls[i] > 0) consecWins++;
      else if (consecLosses > 0 && pnls[i] <= 0) consecLosses++;
      else break;
    }
  }

  return {
    total_trades: trades.length,
    wins,
    losses,
    win_rate: winRate,
    total_pnl: totalPnl,
    roi_pct: roiPct,
    avg_pnl: avgPnl,
    max_drawdown: maxDrawdown(balances),
    sharpe_ratio: sharpeRatio(pnls),
    consecutive_wins: consecWins,
    consecutive_losses: consecLosses,
    balance: account ? account.balance_usdc : null,
  };
}

/**
 * promoteToProd(versionId) — Mark version as prod-synced and update model record.
 */
function promoteToProd(versionId) {
  const db = getDb();
  ensureVersionsTable(db);

  const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId);
  if (!version) return false;

  db.transaction(() => {
    // Mark as prod-synced
    db.prepare('UPDATE versions SET is_prod_synced = 1 WHERE id = ?').run(versionId);

    // Update the model's weights and thresholds to match this version
    db.prepare(`
      UPDATE models SET signal_weights = ?, thresholds = ? WHERE id = ?
    `).run(version.signal_weights, version.thresholds, version.model_id);
  })();

  console.log(`[VersionManager] Model ${version.model_id}: promoted version ${version.version_num} to prod`);
  return true;
}

/**
 * onWeightsChanged(modelId, reason, oldWeights, newWeights, oldThreshold, newThreshold)
 * Called from self-improver when weights change. Creates a new version.
 */
function onWeightsChanged(modelId, reason, oldWeights, newWeights, oldThreshold, newThreshold) {
  return createVersion(modelId, reason, oldWeights, newWeights, oldThreshold, newThreshold);
}

module.exports = {
  ensureVersionsTable,
  createVersion,
  seedV1,
  getVersionHistory,
  getBestVersion,
  getVersionStats,
  promoteToProd,
  onWeightsChanged,
};

// ─── CLI test ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test') || args.includes('--all')) {
    const db = getDb();
    ensureVersionsTable(db);

    const models = db.prepare('SELECT * FROM models WHERE is_active = 1').all();
    console.log(`[VersionManager] Test mode — ${models.length} active models\n`);

    // Seed v1 for any models that don't have versions yet
    for (const m of models) {
      seedV1(m.id);
    }

    // Show version history for all models
    for (const m of models) {
      const history = getVersionHistory(m.id);
      console.log(`═══ Model ${m.id}: ${m.name} ═══`);
      console.log(`Versions: ${history.length}`);
      for (const v of history) {
        const sharpe = v.sharpe_ratio != null ? v.sharpe_ratio.toFixed(3) : 'N/A (< 3 trades)';
        const dd = (v.max_drawdown * 100).toFixed(1) + '%';
        console.log(
          `  v${v.version_num} | created: ${v.created_at} | reason: ${v.mutation_reason || 'initial'} | ` +
          `trades: ${v.total_trades} | W/L: ${v.wins}/${v.losses} | ` +
          `ROI: ${v.roi_pct.toFixed(1)}% | Sharpe: ${sharpe} | MaxDD: ${dd} | ` +
          `prod: ${v.is_prod_synced ? '✓' : '✗'}`
        );
      }

      const best = getBestVersion(m.id);
      if (best) {
        console.log(`  → Best version (min 20 trades): v${best.version_num} (Sharpe: ${best.sharpe_ratio?.toFixed(3)})`);
      } else {
        console.log(`  → Best version: N/A (need ≥20 trades in a version)`);
      }
      console.log('');
    }

    process.exit(0);
  } else {
    // Show single model
    const modelId = parseInt(args[0] || '1', 10);
    const db = getDb();
    ensureVersionsTable(db);
    seedV1(modelId);
    const history = getVersionHistory(modelId);
    console.log(JSON.stringify(history, null, 2));
  }
}
