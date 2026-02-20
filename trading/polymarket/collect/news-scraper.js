// news-scraper.js — BTC news collector via Brave Search API
'use strict';

const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');
const { scoreTexts, scoreWithLLM } = require('../engine/local-sentiment');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');

// Brave Search API key
const BRAVE_API_KEY = 'BSAmgXB6MVraRin9_gNICfdTX5hvjxd';

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'polymarket-bot/1.0',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 429) {
          reject(new Error('RATE_LIMITED'));
          return;
        }
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`Auth error: HTTP ${res.statusCode}`));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchAndStore() {
  try {
    const url = 'https://api.search.brave.com/res/v1/news/search?q=bitcoin+price&count=10&freshness=ph';
    const data = await httpsGet(url, {
      'X-Subscription-Token': BRAVE_API_KEY
    });

    const results = data.results || [];
    const database = getDb();
    const models = database.prepare('SELECT id FROM models WHERE is_active = 1').all();

    const insertSignal = database.prepare(`
      INSERT INTO signals (model_id, source, raw_value, normalized, metadata)
      VALUES (?, 'news_sentiment', ?, ?, ?)
    `);

    // Store raw headlines + descriptions as metadata JSON
    const articles = results.map(article => ({
      title: article.title || '',
      description: article.description || '',
      url: article.url || '',
      age: article.age || '',
      published: article.meta_url?.path || ''
    }));

    // Score sentiment from headlines + descriptions
    // Try LLM (4090) first for nuanced scoring, fall back to word-list
    const headlines = articles.map(a => [a.title, a.description].filter(Boolean).join(' '));
    const llmResult = await scoreWithLLM(headlines);
    const wordListResult = scoreTexts(headlines);

    // Use LLM score if available, otherwise word-list
    const aggregate = llmResult.source !== 'wordlist:fallback' ? llmResult.aggregate : wordListResult.aggregate;
    const summary = llmResult.source !== 'wordlist:fallback' ? llmResult.summary : wordListResult.summary;

    const meta = JSON.stringify({
      articles,
      count: articles.length,
      fetched_at: new Date().toISOString(),
      sentiment_summary: summary,
      sentiment_score: aggregate,
      wordlist_score: wordListResult.aggregate,
      llm_score: llmResult.source !== 'wordlist:fallback' ? llmResult.aggregate : null,
      scoring_source: llmResult.source
    });

    for (const model of models) {
      insertSignal.run(model.id, aggregate, aggregate, meta);
    }

    console.log(`[NewsScraper] ${new Date().toISOString()} Fetched ${articles.length} BTC news articles — ${summary}`);
    if (articles.length > 0) {
      console.log(`[NewsScraper] Top headline: "${articles[0].title}"`);
    }

    // Clean up old news signals (keep last 7 days)
    database.prepare(`
      DELETE FROM signals
      WHERE source = 'news_sentiment'
      AND timestamp < datetime('now', '-7 days')
    `).run();

  } catch (err) {
    if (err.message === 'RATE_LIMITED') {
      console.warn('[NewsScraper] Rate limited by Brave Search, will retry next cycle');
    } else {
      console.error('[NewsScraper] Error:', err.message);
    }
  }
}

async function run() {
  await fetchAndStore();
}

module.exports = { run, fetchAndStore };

if (require.main === module) {
  console.log('[NewsScraper] Starting news collector (30min interval)...');
  run();
  setInterval(run, 30 * 60 * 1000);
}
