// start-all.js — Master launcher: starts all collectors, aggregator, and dashboard
'use strict';

const cron = require('node-cron');
const path = require('path');

console.log('='.repeat(60));
console.log('  Polymarket Paper Trading Intelligence System');
console.log('  Starting all services...');
console.log('='.repeat(60));

// Import all modules
const priceFeed = require('./collect/price-feed');
const polyOdds = require('./collect/poly-odds');
const fearGreed = require('./collect/fear-greed');
const newsScraper = require('./collect/news-scraper');
const aggregator = require('./engine/aggregator');
const dashboard = require('./dashboard/server');
const { resolveSettledMarkets } = require('./collect/market-resolver');

// ─── Start dashboard first ───────────────────────────────────────────────────
dashboard.start();

// ─── Run on startup ──────────────────────────────────────────────────────────
console.log('\n[Startup] Running initial data collection...');

(async () => {
  // Fear & Greed on startup (hourly signal, get one immediately)
  console.log('[Startup] Fetching Fear & Greed index...');
  await fearGreed.run().catch(e => console.error('[Startup] FearGreed error:', e.message));

  // News on startup
  console.log('[Startup] Fetching BTC news...');
  await newsScraper.run().catch(e => console.error('[Startup] News error:', e.message));

  // Price feed
  console.log('[Startup] Fetching BTC price...');
  await priceFeed.run().catch(e => console.error('[Startup] PriceFeed error:', e.message));

  // Poly odds
  console.log('[Startup] Fetching Polymarket odds...');
  await polyOdds.run().catch(e => console.error('[Startup] PolyOdds error:', e.message));

  console.log('\n[Startup] Initial collection complete.\n');

  // Run aggregator after initial data
  setTimeout(async () => {
    console.log('[Startup] Running initial aggregation...');
    await aggregator.runAll().catch(e => console.error('[Startup] Aggregator error:', e.message));
  }, 3000);
})();

// ─── Cron schedules ──────────────────────────────────────────────────────────

// Price feed: every 60 seconds
cron.schedule('* * * * *', async () => {
  await priceFeed.run().catch(e => console.error('[Cron] PriceFeed error:', e.message));
});
console.log('[Cron] Price feed: every 60s');

// Poly odds: every 2 minutes
cron.schedule('*/2 * * * *', async () => {
  await polyOdds.run().catch(e => console.error('[Cron] PolyOdds error:', e.message));
});
console.log('[Cron] Poly odds: every 2min');

// Fear & Greed: every hour
cron.schedule('0 * * * *', async () => {
  await fearGreed.run().catch(e => console.error('[Cron] FearGreed error:', e.message));
});
console.log('[Cron] Fear & Greed: every hour');

// News: every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  await newsScraper.run().catch(e => console.error('[Cron] News error:', e.message));
});
console.log('[Cron] News scraper: every 30min');

// Aggregator: every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await aggregator.runAll().catch(e => console.error('[Cron] Aggregator error:', e.message));
});
console.log('[Cron] Aggregator: every 5min');

// Market resolver: every 30 seconds — determines win/loss for settled trades
cron.schedule('*/30 * * * * *', () => {
  resolveSettledMarkets().catch(e => console.error('[Resolver]', e.message));
});
console.log('[Cron] Market resolver: every 30s');

console.log('\n[System] All services scheduled. Dashboard at http://localhost:8766\n');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[System] SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[System] SIGINT received, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[System] Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[System] Unhandled rejection:', reason);
});
