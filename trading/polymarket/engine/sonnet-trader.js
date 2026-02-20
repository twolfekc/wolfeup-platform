// sonnet-trader.js — Sonnet 4.6 trading decision engine
// This is the ONLY place Sonnet is called in the whole system.
'use strict';

const { preScore: ollamaPreScore, isAvailable: ollamaAvailable } = require('./local-llm');

const https = require('https');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'poly.db');
const AUTH_PROFILES_PATH = path.join(
  process.env.HOME || '/home/tyler',
  '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json'
);

// Pre-score threshold — below this, skip Sonnet call entirely
const PRE_SCORE_MIN = 0.55;

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

function getAnthropicToken() {
  // 1. Environment variable first
  if (process.env.ANTHROPIC_API_KEY) return { type: 'apiKey', token: process.env.ANTHROPIC_API_KEY };

  // 2. OpenClaw auth-profiles.json (OAuth token)
  try {
    if (fs.existsSync(AUTH_PROFILES_PATH)) {
      const profiles = JSON.parse(fs.readFileSync(AUTH_PROFILES_PATH, 'utf8'));
      const ap = profiles.profiles && profiles.profiles['anthropic:default'];
      if (ap && ap.access) {
        // Check if it's an OAuth token (sk-ant-oat*)
        const isOAuth = ap.access.includes('sk-ant-oat');
        return { type: isOAuth ? 'oauth' : 'apiKey', token: ap.access };
      }
    }
  } catch (err) {
    console.error('[SonnetTrader] Could not read auth-profiles:', err.message);
  }

  // 3. Fallback: openclaw.json (may have API key in models.providers)
  try {
    const oclawPath = path.join(process.env.HOME || '/home/tyler', '.openclaw', 'openclaw.json');
    if (fs.existsSync(oclawPath)) {
      const oclaw = JSON.parse(fs.readFileSync(oclawPath, 'utf8'));
      const anthropicProvider = oclaw.models?.providers?.anthropic;
      if (anthropicProvider?.apiKey && anthropicProvider.apiKey !== 'minimax-oauth') {
        return { type: 'apiKey', token: anthropicProvider.apiKey };
      }
    }
  } catch (err) { /* ignore */ }

  throw new Error('[SonnetTrader] No Anthropic auth token found. Set ANTHROPIC_API_KEY or configure OpenClaw.');
}

// ─── Anthropic API call ────────────────────────────────────────────────────

function callSonnet(prompt) {
  return new Promise((resolve, reject) => {
    const { type, token } = getAnthropicToken();

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    });

    // Build headers based on auth type
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body),
    };

    if (type === 'oauth') {
      // OAuth token: use Authorization: Bearer + claude-code identity headers
      headers['Authorization'] = `Bearer ${token}`;
      headers['anthropic-beta'] = 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14';
      headers['x-app'] = 'cli';
      headers['user-agent'] = 'claude-cli/2.1.2 (external, cli)';
    } else {
      // Regular API key
      headers['x-api-key'] = token;
    }

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'error') {
            reject(new Error(`Anthropic API error: ${parsed.error?.message || JSON.stringify(parsed.error)}`));
            return;
          }
          const text = parsed.content?.[0]?.text || '';
          // Return both text and usage for cost tracking
          resolve({ text, usage: parsed.usage || {} });
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${e.message} | raw: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Sonnet HTTP error: ${e.message}`)));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Sonnet request timed out after 30s'));
    });

    req.write(body);
    req.end();
  });
}

// ─── Response parser ────────────────────────────────────────────────────────

function parseDecision(text) {
  // Extract JSON from response (it may have surrounding text or code fences)
  let raw = text.trim();

  // Strip ```json ... ``` fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  // Try to extract JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { direction: 'hold', confidence: 'low', bet_amount: 0, reasoning: 'Could not parse response' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      direction: ['up', 'down', 'hold'].includes(parsed.direction) ? parsed.direction : 'hold',
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
      bet_amount: typeof parsed.bet_amount === 'number' ? Math.max(0, parsed.bet_amount) : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.substring(0, 200) : 'No reasoning',
    };
  } catch (_) {
    return { direction: 'hold', confidence: 'low', bet_amount: 0, reasoning: 'JSON parse error' };
  }
}

// ─── Telegram notification ──────────────────────────────────────────────────

function sendTelegramNotification(msg) {
  try {
    const { sendTelegram } = require('../collect/send-telegram');
    sendTelegram(msg).catch(e => console.error('[SonnetTrader] Telegram error:', e.message));
  } catch (_) { /* non-fatal */ }
}

// ─── Bet sizing guard ───────────────────────────────────────────────────────

function checkBetSizerSkip(modelId) {
  try {
    const betSizerPath = path.join(__dirname, 'bet-sizer.js');
    if (fs.existsSync(betSizerPath)) {
      const { shouldSkipTrade } = require('./bet-sizer');
      if (typeof shouldSkipTrade === 'function') {
        return shouldSkipTrade(modelId, 0.5, 'up', { balance: 100, winProbability: 0.5, maxBet: 10 });
      }
    }
  } catch (_) { /* bet-sizer optional */ }
  return { skip: false };
}

// ─── Signal run logging ─────────────────────────────────────────────────────

function logDecisionToSignalRuns(db, modelId, brief, decision, rawResponse) {
  try {
    // Check if signal_runs has a sonnet_decision column — add if not (graceful)
    const cols = db.prepare("PRAGMA table_info(signal_runs)").all().map(c => c.name);

    if (!cols.includes('sonnet_decision')) {
      db.prepare('ALTER TABLE signal_runs ADD COLUMN sonnet_decision TEXT').run();
    }
    if (!cols.includes('sonnet_reasoning')) {
      db.prepare('ALTER TABLE signal_runs ADD COLUMN sonnet_reasoning TEXT').run();
    }

    // Get latest signal run for this model to update
    const latest = db.prepare(
      'SELECT id FROM signal_runs WHERE model_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(modelId);

    if (latest) {
      db.prepare(`
        UPDATE signal_runs
        SET sonnet_decision = ?, sonnet_reasoning = ?
        WHERE id = ?
      `).run(
        JSON.stringify({ direction: decision.direction, confidence: decision.confidence, bet_amount: decision.bet_amount }),
        decision.reasoning,
        latest.id
      );
    } else {
      // Insert new signal run record
      db.prepare(`
        INSERT INTO signal_runs (model_id, aggregated_score, direction, confidence, reasoning, sources_used, action_taken, sonnet_decision, sonnet_reasoning)
        VALUES (?, 0, ?, ?, ?, '[]', 'sonnet', ?, ?)
      `).run(
        modelId,
        decision.direction,
        decision.confidence,
        `Sonnet decision: ${decision.reasoning}`,
        JSON.stringify({ direction: decision.direction, confidence: decision.confidence, bet_amount: decision.bet_amount }),
        decision.reasoning
      );
    }
  } catch (err) {
    console.error('[SonnetTrader] Failed to log decision to signal_runs:', err.message);
  }
}

// ─── Main decision entry point ──────────────────────────────────────────────

/**
 * makeDecision(modelId, marketId) — Main entry point
 * Returns decision object: { direction, confidence, bet_amount, reasoning, skipped, trade }
 */
async function makeDecision(modelId, marketId) {
  const db = getDb();

  // 1. Check bet-sizer skip
  const skipCheck = checkBetSizerSkip(modelId);
  if (skipCheck.skip) {
    console.log(`[SonnetTrader] Model ${modelId}: bet-sizer skip — ${skipCheck.reason}`);
    return { skipped: true, reason: skipCheck.reason, direction: 'hold', confidence: 'low', bet_amount: 0 };
  }

  // 2. Load context brief (from cache or generate fresh)
  const { getBrief } = require('./context-brief');
  const briefData = getBrief(modelId);
  const brief = briefData.text;

  // 3. Check pre-score from brief (look for "Pre-score:" line)
  const preScoreMatch = brief.match(/Pre-score:\s*(-?[\d.]+)/);
  const preScore = preScoreMatch ? Math.abs(parseFloat(preScoreMatch[1])) : 0;
  if (preScore < PRE_SCORE_MIN) {
    console.log(`[SonnetTrader] Model ${modelId}: pre-score ${preScore.toFixed(2)} < ${PRE_SCORE_MIN} threshold — skipping Sonnet`);
    return { skipped: true, reason: `pre-score ${preScore.toFixed(2)} below threshold`, direction: 'hold', confidence: 'low', bet_amount: 0 };
  }

  // 4. Ollama pre-check — use local LLM to gate Sonnet calls
  let ollamaPreCheck = null;
  try {
    const ollamaUp = await ollamaAvailable();
    if (ollamaUp) {
      ollamaPreCheck = await ollamaPreScore(briefData.text);
      console.log(`[SonnetTrader] Model ${modelId}: Ollama pre-check → ${ollamaPreCheck.direction} (${ollamaPreCheck.confidence}) | "${ollamaPreCheck.reasoning}"`);

      // If Ollama says low confidence → skip Sonnet entirely (saves tokens/cost)
      if (ollamaPreCheck.confidence === 'low') {
        console.log(`[SonnetTrader] Model ${modelId}: Ollama says low confidence — skipping Sonnet call`);
        return {
          skipped: true,
          reason: 'ollama_low_confidence',
          direction: 'hold',
          confidence: 'low',
          bet_amount: 0,
          ollama: ollamaPreCheck,
        };
      }
    }
  } catch(e) {
    console.warn(`[SonnetTrader] Ollama pre-check failed: ${e.message}`);
  }

  // 5. Build Sonnet prompt
  const prompt = `You are a Polymarket trading bot. Make a bet decision based on this market brief.

${brief}

Respond in JSON only:
{
  "direction": "up" | "down" | "hold",
  "confidence": "low" | "medium" | "high",
  "bet_amount": 0,
  "reasoning": "one sentence max"
}

Rules: Only bet if confidence=high. bet_amount must not exceed the Kelly suggested amount. If hold, bet_amount=0.`;

  // 6. Call Sonnet 4.6
  console.log(`[SonnetTrader] Model ${modelId}: calling Sonnet (pre-score=${preScore.toFixed(2)})...`);
  let apiResponse;
  try {
    apiResponse = await callSonnet(prompt);
  } catch (err) {
    console.error(`[SonnetTrader] Sonnet API error:`, err.message);
    return { skipped: true, reason: `API error: ${err.message}`, direction: 'hold', confidence: 'low', bet_amount: 0 };
  }

  const rawResponse = apiResponse.text;

  // 5a. Track token usage and cost
  const tokensIn = apiResponse.usage?.input_tokens || 0;
  const tokensOut = apiResponse.usage?.output_tokens || 0;
  // Sonnet 4.6 pricing: $3/M input, $15/M output
  const costUsd = (tokensIn * 3 + tokensOut * 15) / 1_000_000;
  console.log(`[SonnetTrader] API cost: $${costUsd.toFixed(5)} (${tokensIn}in/${tokensOut}out)`);

  // Store in ai_costs table
  let aiCostId = null;
  try {
    const costInsert = db.prepare(
      `INSERT INTO ai_costs (model_id, call_type, tokens_in, tokens_out, cost_usd) VALUES (?, 'trade_decision', ?, ?, ?)`
    ).run(modelId, tokensIn, tokensOut, costUsd);
    aiCostId = costInsert.lastInsertRowid;
  } catch (e) {
    console.warn('[SonnetTrader] Could not log cost:', e.message);
  }

  // 6. Parse response
  const decision = parseDecision(rawResponse);
  console.log(`[SonnetTrader] Model ${modelId}: decision=${decision.direction} conf=${decision.confidence} bet=${decision.bet_amount} | "${decision.reasoning}"`);

  // 7. Log decision
  logDecisionToSignalRuns(db, modelId, brief, decision, rawResponse);

  let trade = null;

  // 8. Place bet if high confidence
  if (decision.confidence === 'high' && decision.direction !== 'hold' && decision.bet_amount > 0) {
    // Determine market to bet on
    let activeMarketId = marketId;
    if (!activeMarketId) {
      const snap = db.prepare(`
        SELECT market_id FROM market_snapshots
        WHERE timestamp >= datetime('now', '-5 minutes')
        ORDER BY timestamp DESC LIMIT 1
      `).get();
      if (snap) activeMarketId = snap.market_id;
    }

    if (!activeMarketId) {
      console.log(`[SonnetTrader] Model ${modelId}: no active market found, cannot place bet`);
    } else {
      try {
        const { placeBet } = require('./trader');
        const snap = db.prepare(
          'SELECT up_odds, down_odds FROM market_snapshots WHERE market_id = ? ORDER BY timestamp DESC LIMIT 1'
        ).get(activeMarketId);

        const entryOdds = decision.direction === 'up'
          ? (snap ? snap.up_odds || 0.5 : 0.5)
          : (snap ? snap.down_odds || 0.5 : 0.5);

        trade = placeBet(modelId, activeMarketId, decision.direction, decision.bet_amount, entryOdds);
        console.log(`[SonnetTrader] Model ${modelId}: bet placed — trade #${trade ? trade.id : 'failed'}`);

        // Update trade record with token cost info, and link ai_costs entry to trade
        if (trade && trade.id) {
          try {
            db.prepare(
              `UPDATE trades SET sonnet_tokens_in=?, sonnet_tokens_out=?, sonnet_cost_usd=?, sonnet_reasoning=? WHERE id=?`
            ).run(tokensIn, tokensOut, costUsd, decision.reasoning || '', trade.id);
          } catch (e) { /* non-fatal */ }
          if (aiCostId !== null) {
            try {
              db.prepare(`UPDATE ai_costs SET trade_id=? WHERE id=?`).run(trade.id, aiCostId);
            } catch (e) { /* non-fatal */ }
          }
        }
      } catch (err) {
        console.error(`[SonnetTrader] placeBet error:`, err.message);
      }
    }
  }

  // 9. Telegram notification if bet placed or high confidence signal
  if (trade || decision.confidence === 'high') {
    const model = db.prepare('SELECT name FROM models WHERE id = ?').get(modelId);
    const modelName = model ? model.name : `Model ${modelId}`;
    const emoji = decision.direction === 'up' ? '📈' : decision.direction === 'down' ? '📉' : '➡️';
    let msg = `🤖 <b>Sonnet Decision — ${modelName}</b>\n\n`;
    msg += `${emoji} Direction: <b>${decision.direction.toUpperCase()}</b> | Confidence: <b>${decision.confidence.toUpperCase()}</b>\n`;
    msg += `💭 ${decision.reasoning}\n`;
    if (trade) {
      msg += `\n🎰 <b>BET PLACED</b>: ${fmt$(decision.bet_amount)} on ${decision.direction.toUpperCase()}\n`;
      msg += `Trade #${trade.id}\n`;
    }
    sendTelegramNotification(msg);
  }

  // 10. Return decision object
  return {
    skipped: false,
    direction: decision.direction,
    confidence: decision.confidence,
    bet_amount: decision.bet_amount,
    reasoning: decision.reasoning,
    trade,
    brief_age_s: Math.floor((Date.now() - new Date(briefData.generated_at).getTime()) / 1000),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    ollama: ollamaPreCheck,
  };
}

function fmt$(n) {
  if (n == null) return 'N/A';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

module.exports = { makeDecision };

// ─── CLI test ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const modelId = parseInt(process.argv[2] || '1', 10);
  const marketId = process.argv[3] || null;
  console.log(`[SonnetTrader] Test mode — model ${modelId}, market: ${marketId || 'auto'}`);
  makeDecision(modelId, marketId)
    .then(d => {
      console.log('\n[SonnetTrader] Result:');
      console.log(JSON.stringify(d, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[SonnetTrader] Error:', err.message);
      process.exit(1);
    });
}
