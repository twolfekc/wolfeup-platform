#!/usr/bin/env node
// init-db.js — Initialize SQLite database and seed default models
'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'poly.db');
const SCHEMA_PATH = path.join(__dirname, 'data', 'schema.sql');

// Ensure data dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

console.log(`Initializing database at ${DB_PATH}`);
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Read and execute schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);
console.log('Schema applied.');

// Seed default models
const models = [
  {
    name: 'Conservative',
    description: 'Low-risk model. High threshold before betting, small max bets. Prioritizes price momentum and fear/greed.',
    signal_weights: {
      price_momentum: 0.3,
      x_sentiment: 0.1,
      news_sentiment: 0.2,
      fear_greed: 0.2,
      volume: 0.1,
      poly_odds: 0.1
    },
    thresholds: {
      bet_threshold: 0.75,
      max_bet: 5
    }
  },
  {
    name: 'Balanced',
    description: 'Moderate risk/reward. Balanced weights across all signals. Good for general market conditions.',
    signal_weights: {
      price_momentum: 0.25,
      x_sentiment: 0.2,
      news_sentiment: 0.2,
      fear_greed: 0.15,
      volume: 0.1,
      poly_odds: 0.1
    },
    thresholds: {
      bet_threshold: 0.65,
      max_bet: 10
    }
  },
  {
    name: 'Aggressive',
    description: 'High-risk, high-reward. Lower threshold, larger bets. Heavy social sentiment weighting.',
    signal_weights: {
      price_momentum: 0.2,
      x_sentiment: 0.25,
      news_sentiment: 0.2,
      fear_greed: 0.1,
      volume: 0.15,
      poly_odds: 0.1
    },
    thresholds: {
      bet_threshold: 0.55,
      max_bet: 20
    }
  }
];

const insertModel = db.prepare(`
  INSERT OR IGNORE INTO models (name, description, signal_weights, thresholds)
  VALUES (@name, @description, @signal_weights, @thresholds)
`);

const insertAccount = db.prepare(`
  INSERT OR IGNORE INTO paper_accounts (model_id, balance_usdc, starting_balance)
  VALUES (@model_id, 100.0, 100.0)
`);

const getModelByName = db.prepare('SELECT id FROM models WHERE name = ?');

const seedAll = db.transaction(() => {
  for (const model of models) {
    insertModel.run({
      name: model.name,
      description: model.description,
      signal_weights: JSON.stringify(model.signal_weights),
      thresholds: JSON.stringify(model.thresholds)
    });

    const row = getModelByName.get(model.name);
    if (row) {
      insertAccount.run({ model_id: row.id });
      console.log(`  ✓ Model "${model.name}" (id=${row.id}) — account seeded`);
    }
  }
});

seedAll();

console.log('\nDatabase initialized successfully.');
console.log('Models seeded: Conservative, Balanced, Aggressive');
console.log('Each model has a paper account with $100 USDC starting balance.\n');

db.close();
