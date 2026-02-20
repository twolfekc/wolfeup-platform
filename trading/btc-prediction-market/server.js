/**
 * BTC 5-Minute Prediction Market Backend
 * Express server with Polymarket + CoinGecko integration
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8585;

// ─── Paths ─────────────────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BETS_FILE  = path.join(DATA_DIR, 'bets.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── Default state ──────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  balance: 1000.00,
  totalBets: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalProfitLoss: 0
};

// ─── In-memory cache ────────────────────────────────────────────────────────
let marketCache = {
  windowTs: null,
  slug: null,
  question: null,
  startsAt: null,
  endsAt: null,
  secondsRemaining: null,
  upPrice: null,
  downPrice: null,
  upTokenId: null,
  downTokenId: null,
  resolved: false,
  resolutionType: null,
  btcPrice: null,
  lastUpdated: null,
  error: null
};

// ─── Init data files ────────────────────────────────────────────────────────
function initDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('[init] Created data directory');
  }
  if (!fs.existsSync(STATE_FILE)) {
    writeJSON(STATE_FILE, DEFAULT_STATE);
    console.log('[init] Created default state.json');
  }
  if (!fs.existsSync(BETS_FILE)) {
    writeJSON(BETS_FILE, []);
    console.log('[init] Created default bets.json');
  }
}

// ─── JSON helpers ────────────────────────────────────────────────────────────
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`[readJSON] Error reading ${filePath}:`, e.message);
    return null;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[writeJSON] Error writing ${filePath}:`, e.message);
  }
}

// ─── Window calculation ──────────────────────────────────────────────────────
function getCurrentWindow() {
  const now = Math.floor(Date.now() / 1000);
  const windowTs = now - (now % 300);
  return {
    windowTs,
    slug: `btc-updown-5m-${windowTs}`,
    startsAt: new Date(windowTs * 1000),
    endsAt: new Date((windowTs + 300) * 1000),
    secondsRemaining: (windowTs + 300) - now
  };
}

function getPreviousWindow() {
  const now = Math.floor(Date.now() / 1000);
  const windowTs = now - (now % 300) - 300;
  return {
    windowTs,
    slug: `btc-updown-5m-${windowTs}`,
    startsAt: new Date(windowTs * 1000),
    endsAt: new Date((windowTs + 300) * 1000)
  };
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchPolymarketMarket(slug) {
  const url = `https://gamma-api.polymarket.com/markets?slug=${slug}`;
  console.log(`[polymarket] Fetching: ${url}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Polymarket HTTP ${res.status}`);
  const data = await res.json();
  // API returns array
  const markets = Array.isArray(data) ? data : (data.markets || []);
  if (!markets.length) return null;
  return markets[0];
}

async function fetchClobMidpoint(tokenId) {
  const url = `https://clob.polymarket.com/midpoint?token_id=${tokenId}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`CLOB HTTP ${res.status}`);
  const data = await res.json();
  return parseFloat(data.mid);
}

async function fetchBtcPrice() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json();
  return data.bitcoin.usd;
}

// ─── Main polling loop ───────────────────────────────────────────────────────
async function pollMarket() {
  try {
    const win = getCurrentWindow();

    // 1. Fetch BTC price (always)
    let btcPrice = marketCache.btcPrice;
    try {
      btcPrice = await fetchBtcPrice();
    } catch (e) {
      console.warn('[poll] BTC price fetch failed:', e.message);
    }

    // 2. Fetch Polymarket market
    let market = null;
    try {
      market = await fetchPolymarketMarket(win.slug);
    } catch (e) {
      console.warn('[poll] Polymarket fetch failed:', e.message);
    }

    if (!market) {
      // Update cache with fresh window + BTC price even if market unavailable
      const freshWin = getCurrentWindow();
      marketCache = {
        ...marketCache,
        windowTs: freshWin.windowTs,
        slug: freshWin.slug,
        startsAt: freshWin.startsAt,
        endsAt: freshWin.endsAt,
        secondsRemaining: freshWin.secondsRemaining,
        btcPrice,
        lastUpdated: new Date().toISOString(),
        error: 'Market not found for current window'
      };
      return;
    }

    // Parse outcome prices
    let outcomePrices = [];
    try {
      outcomePrices = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : (market.outcomePrices || []);
    } catch (e) {
      console.warn('[poll] Could not parse outcomePrices:', e.message);
    }

    // Parse CLOB token IDs
    let clobTokenIds = [];
    try {
      clobTokenIds = typeof market.clobTokenIds === 'string'
        ? JSON.parse(market.clobTokenIds)
        : (market.clobTokenIds || []);
    } catch (e) {
      console.warn('[poll] Could not parse clobTokenIds:', e.message);
    }

    // Determine up/down token IDs
    // Polymarket BTC up/down markets: outcomes[0] = Up, outcomes[1] = Down
    const upTokenId   = clobTokenIds[0] || null;
    const downTokenId = clobTokenIds[1] || null;

    // Use gamma prices as baseline
    let upPrice   = outcomePrices[0] ? parseFloat(outcomePrices[0]) : null;
    let downPrice = outcomePrices[1] ? parseFloat(outcomePrices[1]) : null;

    // Try to get live CLOB midpoint for Up token
    if (upTokenId) {
      try {
        const mid = await fetchClobMidpoint(upTokenId);
        if (mid > 0 && mid < 1) {
          upPrice   = mid;
          downPrice = parseFloat((1 - mid).toFixed(4));
        }
      } catch (e) {
        console.warn('[poll] CLOB midpoint fetch failed:', e.message);
      }
    }

    const freshWin = getCurrentWindow();
    marketCache = {
      windowTs: freshWin.windowTs,
      slug: freshWin.slug,
      question: market.question || null,
      startsAt: freshWin.startsAt,
      endsAt: freshWin.endsAt,
      secondsRemaining: freshWin.secondsRemaining,
      upPrice,
      downPrice,
      upTokenId,
      downTokenId,
      resolved: market.resolved || false,
      resolutionType: market.resolutionType || null,
      btcPrice,
      lastUpdated: new Date().toISOString(),
      error: null
    };

    console.log(`[poll] Updated — BTC: $${btcPrice} | Up: ${upPrice} | Down: ${downPrice} | ${freshWin.secondsRemaining}s remaining`);
  } catch (e) {
    console.error('[poll] Unexpected error:', e.message);
    marketCache.error = e.message;
    marketCache.lastUpdated = new Date().toISOString();
  }
}

// ─── Resolution loop ─────────────────────────────────────────────────────────
let lastResolvedWindowTs = null;

async function resolutionLoop() {
  try {
    const bets = readJSON(BETS_FILE) || [];
    const pendingBets = bets.filter(b => b.status === 'pending');
    if (!pendingBets.length) return;

    const now = Math.floor(Date.now() / 1000);

    for (const bet of pendingBets) {
      const windowEnd = bet.windowTs + 300;

      // Don't try to resolve until the window has ended
      if (now < windowEnd) continue;

      const elapsed = now - windowEnd;

      // Wait at least 30s after window closes before resolving
      if (elapsed < 30) {
        console.log(`[resolve] Waiting ${30 - elapsed}s more before resolving bet ${bet.id}`);
        continue;
      }

      // Fetch the completed market
      let resolvedVia = null;
      let outcome = null;

      try {
        const market = await fetchPolymarketMarket(bet.slug);

        if (market && market.resolved) {
          outcome = market.resolutionType; // "Up" or "Down"
          resolvedVia = 'polymarket';
          console.log(`[resolve] Market resolved via Polymarket: ${outcome} for ${bet.id}`);
        } else if (elapsed >= 90) {
          // Fallback: use BTC price comparison
          const currentBtc = marketCache.btcPrice;
          if (currentBtc && bet.btcPriceAtBet) {
            outcome = currentBtc > bet.btcPriceAtBet ? 'Up' : 'Down';
            resolvedVia = 'price_fallback';
            console.log(`[resolve] Fallback resolution: BTC ${bet.btcPriceAtBet} → ${currentBtc} = ${outcome} for ${bet.id}`);
          }
        } else {
          console.log(`[resolve] Waiting for Polymarket resolution (${elapsed}s elapsed) for ${bet.id}`);
          continue;
        }
      } catch (e) {
        console.warn(`[resolve] Error fetching market for ${bet.id}:`, e.message);
        if (elapsed >= 90 && marketCache.btcPrice && bet.btcPriceAtBet) {
          const currentBtc = marketCache.btcPrice;
          outcome = currentBtc > bet.btcPriceAtBet ? 'Up' : 'Down';
          resolvedVia = 'price_fallback';
          console.log(`[resolve] Fallback resolution (after fetch error): ${outcome} for ${bet.id}`);
        } else {
          continue;
        }
      }

      if (!outcome) continue;

      // Determine win/loss
      const won = outcome === bet.direction;
      const status = won ? 'won' : 'lost';

      let payout = 0;
      let profitLoss = 0;

      if (won) {
        // tokens = amount / price; payout = tokens * 1.0
        payout = bet.tokensAcquired * 1.0;
        profitLoss = payout - bet.amount;
      } else {
        payout = 0;
        profitLoss = -bet.amount;
      }

      // Update state
      const state = readJSON(STATE_FILE) || { ...DEFAULT_STATE };
      state.balance = parseFloat((state.balance + payout).toFixed(2));
      state.totalBets = (state.totalBets || 0) + 1;

      if (won) {
        state.wins = (state.wins || 0) + 1;
        state.currentStreak = state.currentStreak > 0 ? state.currentStreak + 1 : 1;
        if (state.currentStreak > (state.bestStreak || 0)) {
          state.bestStreak = state.currentStreak;
        }
      } else {
        state.losses = (state.losses || 0) + 1;
        state.currentStreak = state.currentStreak < 0 ? state.currentStreak - 1 : -1;
      }
      state.totalProfitLoss = parseFloat(((state.totalProfitLoss || 0) + profitLoss).toFixed(2));

      writeJSON(STATE_FILE, state);

      // Update bet record
      const betIdx = bets.findIndex(b => b.id === bet.id);
      if (betIdx !== -1) {
        bets[betIdx] = {
          ...bets[betIdx],
          status,
          outcome,
          resolvedAt: new Date().toISOString(),
          payout: parseFloat(payout.toFixed(2)),
          profitLoss: parseFloat(profitLoss.toFixed(2)),
          resolvedVia
        };
      }
      writeJSON(BETS_FILE, bets);

      console.log(`[resolve] ✅ Bet ${bet.id} → ${status.toUpperCase()} | payout: $${payout.toFixed(2)} | P&L: $${profitLoss.toFixed(2)} | new balance: $${state.balance}`);
    }
  } catch (e) {
    console.error('[resolve] Unexpected error:', e.message);
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── API Routes ──────────────────────────────────────────────────────────────

// GET /api/market
app.get('/api/market', (req, res) => {
  const win = getCurrentWindow();
  res.json({
    windowTs: marketCache.windowTs || win.windowTs,
    slug: marketCache.slug || win.slug,
    question: marketCache.question,
    startsAt: marketCache.startsAt || win.startsAt,
    endsAt: marketCache.endsAt || win.endsAt,
    secondsRemaining: win.secondsRemaining, // always live
    upPrice: marketCache.upPrice,
    downPrice: marketCache.downPrice,
    upTokenId: marketCache.upTokenId,
    downTokenId: marketCache.downTokenId,
    resolved: marketCache.resolved,
    resolutionType: marketCache.resolutionType,
    btcPrice: marketCache.btcPrice,
    lastUpdated: marketCache.lastUpdated,
    error: marketCache.error
  });
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const state = readJSON(STATE_FILE) || { ...DEFAULT_STATE };
  res.json(state);
});

// GET /api/history
app.get('/api/history', (req, res) => {
  const bets = readJSON(BETS_FILE) || [];
  // Return last 50, newest first
  const history = [...bets].reverse().slice(0, 50);
  res.json(history);
});

// GET /api/active
app.get('/api/active', (req, res) => {
  const bets = readJSON(BETS_FILE) || [];
  const active = bets.find(b => b.status === 'pending') || null;
  res.json(active);
});

// POST /api/bet
app.post('/api/bet', (req, res) => {
  const { direction, amount } = req.body;

  // Validate direction
  if (!['Up', 'Down'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be "Up" or "Down"' });
  }

  // Validate amount
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  // Check time cutoff
  const win = getCurrentWindow();
  if (win.secondsRemaining < 30) {
    return res.status(400).json({
      error: `Too late to bet — only ${win.secondsRemaining}s remaining (need ≥30s)`,
      secondsRemaining: win.secondsRemaining
    });
  }

  // Check market data available
  if (!marketCache.upPrice || !marketCache.downPrice) {
    return res.status(503).json({ error: 'Market data not yet available, try again in a moment' });
  }

  // Check for existing active bet
  const bets = readJSON(BETS_FILE) || [];
  const existingActive = bets.find(b => b.status === 'pending');
  if (existingActive) {
    return res.status(400).json({ error: 'You already have an active bet pending resolution' });
  }

  // Check balance
  const state = readJSON(STATE_FILE) || { ...DEFAULT_STATE };
  if (amt > state.balance) {
    return res.status(400).json({ error: `Insufficient balance: $${state.balance.toFixed(2)} available` });
  }

  // Determine price and tokens
  const price = direction === 'Up' ? marketCache.upPrice : marketCache.downPrice;
  const tokensAcquired = parseFloat((amt / price).toFixed(4));

  // Deduct from balance immediately
  state.balance = parseFloat((state.balance - amt).toFixed(2));
  writeJSON(STATE_FILE, state);

  // Create bet record
  const bet = {
    id: `bet_${win.windowTs}_${direction}`,
    windowTs: win.windowTs,
    slug: win.slug,
    question: marketCache.question,
    direction,
    amount: amt,
    odds: price,
    tokensAcquired,
    btcPriceAtBet: marketCache.btcPrice,
    placedAt: new Date().toISOString(),
    status: 'pending',
    resolvedAt: null,
    outcome: null,
    payout: null,
    profitLoss: null,
    resolvedVia: null
  };

  bets.push(bet);
  writeJSON(BETS_FILE, bets);

  console.log(`[bet] Placed: $${amt} ${direction} @ ${price} | tokens: ${tokensAcquired} | balance: $${state.balance}`);

  res.json({
    success: true,
    bet,
    newBalance: state.balance
  });
});

// POST /api/reset
app.post('/api/reset', (req, res) => {
  const newState = { ...DEFAULT_STATE };
  writeJSON(STATE_FILE, newState);
  console.log('[reset] Stats reset to default');
  res.json({ success: true, state: newState });
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    btcPrice: marketCache.btcPrice,
    lastUpdated: marketCache.lastUpdated
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
initDataFiles();

app.listen(PORT, () => {
  console.log(`🚀 BTC Prediction Market server running on http://0.0.0.0:${PORT}`);
  console.log(`📂 Data dir: ${DATA_DIR}`);
  console.log(`🌐 Public dir: ${PUBLIC_DIR}`);

  // Initial poll immediately
  pollMarket();

  // Polling loop every 10s
  setInterval(pollMarket, 10_000);

  // Resolution loop every 15s
  setInterval(resolutionLoop, 15_000);
});
