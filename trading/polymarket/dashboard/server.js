// dashboard/server.js — Express + WebSocket dashboard server
'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');
const PORT = 8766;

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// Import trader for stats
const { getModelStats } = require('../engine/trader');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

// ─── State builder ─────────────────────────────────────────────────────────

function buildState() {
  const database = getDb();

  // ── Prices: transform raw rows → frontend-expected object ──────────────
  const priceRows = database.prepare(
    'SELECT * FROM btc_prices ORDER BY timestamp DESC LIMIT 10'
  ).all();
  const latestPrice = priceRows[0] || {};
  const prices = {
    btc: latestPrice.price || 0,
    change1h: latestPrice.change_1h || 0,
    change24h: latestPrice.change_24h || 0,
    volume24h: latestPrice.volume_24h || 0,
    updatedAt: latestPrice.timestamp || null,
    history: priceRows.map(r => ({ ts: r.timestamp, price: r.price }))
  };

  // ── Markets: latest snapshot per market → shaped objects ───────────────
  const marketRows = database.prepare(`
    SELECT ms.*
    FROM market_snapshots ms
    INNER JOIN (
      SELECT market_id, MAX(timestamp) as max_ts
      FROM market_snapshots
      GROUP BY market_id
    ) latest ON ms.market_id = latest.market_id AND ms.timestamp = latest.max_ts
    ORDER BY ms.timestamp DESC
    LIMIT 10
  `).all();
  const markets = marketRows.map(r => ({
    id: r.market_id,
    name: r.market_name,
    upOdds: r.up_odds,
    downOdds: r.down_odds,
    volume: r.volume_usdc,
    timeRemaining: r.time_remaining,
    timestamp: r.timestamp
  }));

  // ── Models: with properly-shaped stats ─────────────────────────────────
  const modelRows = database.prepare('SELECT * FROM models ORDER BY id').all();
  const models = modelRows.map(row => {
    const weights = JSON.parse(row.signal_weights || '{}');
    const thresholds = JSON.parse(row.thresholds || '{}');
    const stats = getModelStats(row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.is_active === 1,
      isProdSynced: row.is_prod_synced === 1,
      weights,
      thresholds,
      balance: stats.balance,
      startingBalance: stats.starting_balance,
      stats: {
        trades: stats.total_trades,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.win_rate,
        roi: stats.roi_pct / 100,
        totalPnl: stats.total_pnl
      }
    };
  });

  // ── Fear & Greed index ─────────────────────────────────────────────────
  const fgSignal = database.prepare(
    "SELECT normalized FROM signals WHERE source='fear_greed' ORDER BY timestamp DESC LIMIT 1"
  ).get();
  const fearGreed = fgSignal ? Math.round((fgSignal.normalized + 1) / 2 * 100) : 50;

  // ── Recent signals (last 20, all models) ───────────────────────────────
  const recentSignals = database.prepare(`
    SELECT s.*, m.name as model_name
    FROM signals s
    JOIN models m ON m.id = s.model_id
    ORDER BY s.timestamp DESC
    LIMIT 20
  `).all();

  // ── Recent trades (last 20, all models) ────────────────────────────────
  const recentTradesRaw = database.prepare(`
    SELECT t.*, m.name as model_name
    FROM trades t
    JOIN models m ON m.id = t.model_id
    ORDER BY t.opened_at DESC
    LIMIT 20
  `).all();
  const recentTrades = recentTradesRaw.map(r => ({
    ...r,
    sonnet_tokens_in: r.sonnet_tokens_in || 0,
    sonnet_tokens_out: r.sonnet_tokens_out || 0,
    sonnet_cost_usd: r.sonnet_cost_usd || 0,
    sonnet_reasoning: r.sonnet_reasoning || null,
  }));

  // ── Recent signal runs ─────────────────────────────────────────────────
  const recentRuns = database.prepare(`
    SELECT sr.*, m.name as model_name
    FROM signal_runs sr
    JOIN models m ON m.id = sr.model_id
    ORDER BY sr.timestamp DESC
    LIMIT 20
  `).all().map(r => ({
    ...r,
    sources_used: JSON.parse(r.sources_used || '[]')
  }));

  // ── Activity feed: closed trades + model insights (Bug 3) ──────────────
  const recentClosedTrades = database.prepare(`
    SELECT 'trade' as type,
      CASE WHEN pnl > 0 THEN '🟢' ELSE '🔴' END || ' ' ||
      CASE WHEN pnl > 0 THEN 'Win' ELSE 'Loss' END || ': ' ||
      model_id || ' ' || direction || ' $' || ROUND(amount_usdc,2) ||
      ' P&L: $' || ROUND(pnl,2) as text,
      closed_at as ts
    FROM trades WHERE status != 'open' AND closed_at IS NOT NULL
    ORDER BY closed_at DESC LIMIT 10
  `).all();

  const insights = (() => {
    try {
      return database.prepare(`
        SELECT 'insight' as type, '💡 ' || insight_text as text, timestamp as ts
        FROM model_insights ORDER BY timestamp DESC LIMIT 10
      `).all();
    } catch (e) {
      return []; // table may not exist yet
    }
  })();

  const activity = [...recentClosedTrades, ...insights]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 20);

  // ── AI cost summary ────────────────────────────────────────────────────
  let aiCostSummary = { today: 0, week: 0, allTime: 0, recentCalls: [] };
  try {
    const todayCost = database.prepare(
      "SELECT COALESCE(SUM(cost_usd),0) as total FROM ai_costs WHERE timestamp >= date('now')"
    ).get();
    const weekCost = database.prepare(
      "SELECT COALESCE(SUM(cost_usd),0) as total FROM ai_costs WHERE timestamp >= date('now','-7 days')"
    ).get();
    const allTimeCost = database.prepare(
      "SELECT COALESCE(SUM(cost_usd),0) as total FROM ai_costs"
    ).get();
    const recentCalls = database.prepare(
      "SELECT * FROM ai_costs ORDER BY timestamp DESC LIMIT 10"
    ).all();
    aiCostSummary = {
      today: todayCost.total,
      week: weekCost.total,
      allTime: allTimeCost.total,
      recentCalls,
    };
  } catch (e) { /* ai_costs table may not exist yet */ }

  // ── Signal panels: latest run per model (Bug 4) ────────────────────────
  const latestRuns = database.prepare(`
    SELECT sr.*, m.name as model_name
    FROM signal_runs sr
    JOIN models m ON m.id = sr.model_id
    WHERE sr.id IN (
      SELECT MAX(id) FROM signal_runs GROUP BY model_id
    )
  `).all();

  const signalPanels = latestRuns.map(r => ({
    modelId: r.model_id,
    modelName: r.model_name,
    composite: r.aggregated_score,
    direction: r.direction,
    confidence: r.confidence,
    state: r.action_taken === 'bet' ? 'betting' : 'watching',
    sourcesUsed: JSON.parse(r.sources_used || '[]'),
    reasoning: r.reasoning,
    timestamp: r.timestamp
  }));

  return {
    prices,
    markets,
    models,
    fearGreed,
    recentSignals,
    recentTrades,
    recentRuns,
    activity,
    signalPanels,
    aiCostSummary,
    timestamp: new Date().toISOString()
  };
}

// ─── WebSocket broadcast ────────────────────────────────────────────────────

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[Dashboard] WebSocket client connected');
  // Send current state immediately
  try {
    ws.send(JSON.stringify(buildState()));
  } catch (e) {
    console.error('[Dashboard] Error sending initial state:', e.message);
  }

  ws.on('close', () => console.log('[Dashboard] WebSocket client disconnected'));
  ws.on('error', (e) => console.error('[Dashboard] WS error:', e.message));
});

// Broadcast every 5 seconds
setInterval(() => {
  try {
    broadcast(buildState());
  } catch (e) {
    console.error('[Dashboard] Broadcast error:', e.message);
  }
}, 5000);

// ─── REST API ───────────────────────────────────────────────────────────────

// GET /api/state
app.get('/api/state', (req, res) => {
  try {
    res.json(buildState());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/models
app.get('/api/models', (req, res) => {
  try {
    const database = getDb();
    const models = database.prepare('SELECT * FROM models ORDER BY id').all();
    const result = models.map(m => ({
      ...m,
      signal_weights: JSON.parse(m.signal_weights || '{}'),
      thresholds: JSON.parse(m.thresholds || '{}'),
      stats: getModelStats(m.id)
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/model/:id/signals
app.get('/api/model/:id/signals', (req, res) => {
  try {
    const database = getDb();
    const signals = database.prepare(`
      SELECT * FROM signals WHERE model_id = ? ORDER BY timestamp DESC LIMIT 100
    `).all(req.params.id);
    res.json(signals.map(s => ({ ...s, metadata: JSON.parse(s.metadata || '{}') })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/model/:id/trades
app.get('/api/model/:id/trades', (req, res) => {
  try {
    const database = getDb();
    const trades = database.prepare(`
      SELECT * FROM trades WHERE model_id = ? ORDER BY opened_at DESC LIMIT 50
    `).all(req.params.id);
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/model/:id/toggle
app.post('/api/model/:id/toggle', (req, res) => {
  try {
    const database = getDb();
    const model = database.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const newState = model.is_active ? 0 : 1;
    database.prepare('UPDATE models SET is_active = ? WHERE id = ?').run(newState, req.params.id);
    res.json({ id: model.id, name: model.name, is_active: newState });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/model/:id/sync-prod
app.post('/api/model/:id/sync-prod', (req, res) => {
  try {
    const database = getDb();
    const model = database.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const newState = model.is_prod_synced ? 0 : 1;
    database.prepare('UPDATE models SET is_prod_synced = ? WHERE id = ?').run(newState, req.params.id);
    res.json({ id: model.id, name: model.name, is_prod_synced: newState });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/model — create new model
app.post('/api/model', (req, res) => {
  try {
    const { name, description, weights, thresholds } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const database = getDb();
    const info = database.prepare(`
      INSERT INTO models (name, description, signal_weights, thresholds)
      VALUES (?, ?, ?, ?)
    `).run(
      name,
      description || '',
      JSON.stringify(weights || {}),
      JSON.stringify(thresholds || {})
    );

    // Create paper account
    database.prepare(`
      INSERT INTO paper_accounts (model_id, balance_usdc, starting_balance)
      VALUES (?, 100.0, 100.0)
    `).run(info.lastInsertRowid);

    const model = database.prepare('SELECT * FROM models WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({
      ...model,
      signal_weights: JSON.parse(model.signal_weights || '{}'),
      thresholds: JSON.parse(model.thresholds || '{}')
    });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Model name already exists' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// PUT /api/model/:id — update model
app.put('/api/model/:id', (req, res) => {
  try {
    const database = getDb();
    const model = database.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const { name, description, weights, thresholds } = req.body;
    database.prepare(`
      UPDATE models
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          signal_weights = COALESCE(?, signal_weights),
          thresholds = COALESCE(?, thresholds)
      WHERE id = ?
    `).run(
      name || null,
      description || null,
      weights ? JSON.stringify(weights) : null,
      thresholds ? JSON.stringify(thresholds) : null,
      req.params.id
    );

    const updated = database.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    res.json({
      ...updated,
      signal_weights: JSON.parse(updated.signal_weights || '{}'),
      thresholds: JSON.parse(updated.thresholds || '{}')
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/model/:id/compare
app.get('/api/model/:id/compare', (req, res) => {
  try {
    const database = getDb();
    const targetModel = database.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    if (!targetModel) return res.status(404).json({ error: 'Model not found' });

    const allModels = database.prepare('SELECT * FROM models ORDER BY id').all();
    const comparison = allModels.map(m => {
      const stats = getModelStats(m.id);
      return {
        id: m.id,
        name: m.name,
        is_target: m.id === targetModel.id,
        is_active: m.is_active,
        ...stats
      };
    }).sort((a, b) => b.roi_pct - a.roi_pct);

    res.json({
      target: req.params.id,
      models: comparison
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Infrastructure health endpoint
app.get('/api/infra', async (req, res) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execP = promisify(exec);

  const results = {};

  // Check polymarket service itself
  results.polymarket = { name: 'Polymarket Bot', host: process.env.WEB_HOST || 'localhost', port: 8766, status: 'ok', uptime: process.uptime() };

  // Check other services via HTTP
  const webHost = process.env.WEB_HOST || 'localhost';
  const services = [
    { name: 'Games Arcade', url: 'http://localhost:80', host: webHost },
    { name: 'Auth Service', url: 'http://localhost:4000/health', host: webHost },
    { name: 'Loup Dashboard', url: 'http://localhost:5050', host: webHost },
    { name: 'Ping Platform', url: 'http://localhost:5060', host: webHost },
  ];

  const checkService = async (svc) => {
    try {
      const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
      const resp = await fetch(svc.url, { timeout: 2000 });
      return { ...svc, status: resp.ok || resp.status < 500 ? 'ok' : 'error', statusCode: resp.status };
    } catch (e) {
      return { ...svc, status: 'error', error: e.message };
    }
  };

  results.services = await Promise.all(services.map(checkService));

  // System stats
  try {
    const memInfo = await execP("free -m | awk 'NR==2{print $2,$3,$4}'");
    const [total, used, free] = memInfo.stdout.trim().split(' ').map(Number);
    results.memory = { total, used, free, pct: Math.round(used/total*100) };
  } catch(e) { results.memory = null; }

  try {
    const cpuInfo = await execP("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'");
    results.cpu = parseFloat(cpuInfo.stdout.trim()) || 0;
  } catch(e) { results.cpu = null; }

  try {
    const diskInfo = await execP("df -h / | awk 'NR==2{print $2,$3,$4,$5}'");
    const [size, used2, avail, pct] = diskInfo.stdout.trim().split(' ');
    results.disk = { size, used: used2, avail, pct };
  } catch(e) { results.disk = null; }

  // Docker containers
  try {
    const dockerOut = await execP("docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null");
    results.containers = dockerOut.stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, status, image] = line.split('\t');
      return { name, status, image, ok: status && status.startsWith('Up') };
    });
  } catch(e) { results.containers = []; }

  res.json(results);
});

// Signal accuracy endpoint
app.get('/api/signal-accuracy', (req, res) => {
  try {
    const db = getDb();
    // Get closed trades with their signal_runs
    const runs = db.prepare(`
      SELECT sr.model_id, sr.aggregated_score, sr.direction, sr.action_taken,
             t.pnl, t.direction as trade_direction
      FROM signal_runs sr
      LEFT JOIN trades t ON t.model_id = sr.model_id
        AND t.opened_at >= sr.timestamp
        AND t.opened_at <= datetime(sr.timestamp, '+10 minutes')
      WHERE t.status IN ('closed','expired')
      ORDER BY sr.timestamp DESC LIMIT 200
    `).all();

    // Accuracy by signal source (from signals table)
    const signalStats = db.prepare(`
      SELECT s.source,
        COUNT(*) as total,
        AVG(CASE WHEN t.pnl > 0 THEN 1.0 ELSE 0.0 END) as accuracy,
        AVG(s.normalized) as avg_signal,
        AVG(ABS(s.normalized)) as avg_strength
      FROM signals s
      JOIN trades t ON t.model_id = s.model_id
        AND t.opened_at >= s.timestamp
        AND t.opened_at <= datetime(s.timestamp, '+10 minutes')
      WHERE t.status IN ('closed','expired')
      GROUP BY s.source
    `).all();

    res.json({ runs: runs.slice(0, 50), signalStats });
  } catch(e) {
    res.json({ runs: [], signalStats: [], error: e.message });
  }
});

// AI cost history endpoint
app.get('/api/ai-costs', (req, res) => {
  try {
    const db = getDb();
    const costs = db.prepare(`
      SELECT ac.*, t.direction, t.amount_usdc, t.market_name
      FROM ai_costs ac
      LEFT JOIN trades t ON t.id = ac.trade_id
      ORDER BY ac.timestamp DESC LIMIT 50
    `).all();

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN timestamp >= date('now') THEN cost_usd END), 0) as today,
        COALESCE(SUM(CASE WHEN timestamp >= date('now','-7 days') THEN cost_usd END), 0) as week,
        COALESCE(SUM(cost_usd), 0) as all_time,
        COUNT(*) as total_calls
      FROM ai_costs
    `).get();

    res.json({ costs, summary });
  } catch(e) {
    res.json({ costs: [], summary: { today: 0, week: 0, all_time: 0, total_calls: 0 } });
  }
});

// Recent news with sentiment
app.get('/api/news', (req, res) => {
  try {
    const db = getDb();
    const newsSignals = db.prepare(`
      SELECT normalized, metadata, timestamp
      FROM signals WHERE source = 'news_sentiment'
      ORDER BY timestamp DESC LIMIT 20
    `).all();

    const news = newsSignals.map(s => {
      try {
        const meta = JSON.parse(s.metadata || '{}');
        return { ...meta, score: s.normalized, timestamp: s.timestamp };
      } catch { return { score: s.normalized, timestamp: s.timestamp }; }
    });

    res.json({ news });
  } catch(e) {
    res.json({ news: [] });
  }
});

// ─── Start server ────────────────────────────────────────────────────────────

function start() {
  server.listen(PORT, () => {
    console.log(`[Dashboard] Server running at http://localhost:${PORT}`);
  });
}

module.exports = { start, app, server };

if (require.main === module) {
  start();
}
