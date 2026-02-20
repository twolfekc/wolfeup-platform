'use strict';

const http = require('http');

// Dual Ollama endpoints: 4090 (primary, 32B model) → Unraid (fallback, 7B model)
const ENDPOINTS = [
  { name: '4090',   host: process.env.OLLAMA_4090_HOST || 'localhost', port: parseInt(process.env.OLLAMA_4090_PORT || '11435'), model: 'qwen2.5:32b' },
  { name: 'unraid', host: process.env.OLLAMA_HOST || 'localhost',     port: parseInt(process.env.OLLAMA_PORT || '11434'),      model: 'qwen2.5:7b-instruct' },
];

// Legacy single-endpoint compat
const OLLAMA_HOST = ENDPOINTS[0].host;
const OLLAMA_PORT = ENDPOINTS[0].port;
const DEFAULT_MODEL = ENDPOINTS[0].model;

/**
 * Check if a specific Ollama endpoint is available
 */
function checkEndpoint(host, port) {
  return new Promise(resolve => {
    const req = http.request({
      host, port, path: '/api/tags', method: 'GET'
    }, res => {
      resolve(res.statusCode === 200);
    });
    req.setTimeout(2000, () => { req.abort(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

/**
 * Find the best available endpoint (4090 first, then Unraid fallback)
 * @returns {{ name: string, host: string, port: number, model: string } | null}
 */
async function getBestEndpoint() {
  for (const ep of ENDPOINTS) {
    if (await checkEndpoint(ep.host, ep.port)) return ep;
  }
  return null;
}

/**
 * Check if any Ollama endpoint is available
 */
async function isAvailable() {
  return (await getBestEndpoint()) !== null;
}

/**
 * List available models from all endpoints
 */
async function listModels() {
  const allModels = [];
  for (const ep of ENDPOINTS) {
    const models = await new Promise((resolve) => {
      const req = http.request({
        host: ep.host, port: ep.port, path: '/api/tags', method: 'GET'
      }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data).models || []); }
          catch(e) { resolve([]); }
        });
      });
      req.setTimeout(3000, () => { req.abort(); resolve([]); });
      req.on('error', () => resolve([]));
      req.end();
    });
    models.forEach(m => { m._endpoint = ep.name; });
    allModels.push(...models);
  }
  return allModels;
}

/**
 * Generate a completion against a specific host/port (non-streaming)
 */
function generateOnEndpoint(host, port, model, prompt, options = {}) {
  const body = JSON.stringify({
    model,
    prompt,
    stream: false,
    options: {
      temperature: options.temperature || 0.1,
      num_predict: options.maxTokens || 150,
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      host, port,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ text: parsed.response || '', model, tokens: parsed.eval_count || 0, endpoint: `${host}:${port}` });
        } catch(e) {
          reject(new Error('Parse error: ' + data.slice(0, 200)));
        }
      });
    });
    req.setTimeout(options.timeout || 30000, () => { req.abort(); reject(new Error('Ollama timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Generate a completion (non-streaming) — tries 4090 first, then Unraid fallback
 * @param {string} prompt
 * @param {object} options
 */
async function generate(prompt, options = {}) {
  // If caller specifies a specific endpoint, use it directly
  if (options.host && options.port) {
    return generateOnEndpoint(options.host, options.port, options.model || DEFAULT_MODEL, prompt, options);
  }

  // Try endpoints in priority order (4090 → Unraid)
  for (const ep of ENDPOINTS) {
    try {
      const model = options.model || ep.model;
      const result = await generateOnEndpoint(ep.host, ep.port, model, prompt, options);
      console.log(`[LocalLLM] Used ${ep.name} (${model})`);
      return result;
    } catch (e) {
      console.warn(`[LocalLLM] ${ep.name} failed: ${e.message}, trying next...`);
    }
  }
  throw new Error('All Ollama endpoints failed');
}

/**
 * Quick market pre-score using local LLM
 * Returns a JSON decision: { direction, confidence, reasoning }
 * Used BEFORE calling Sonnet — if Ollama says low confidence, skip Sonnet entirely
 *
 * @param {string} contextBrief - the 150-token brief
 * @returns {{ direction: string, confidence: string, reasoning: string, usedOllama: boolean }}
 */
async function preScore(contextBrief) {
  const ep = await getBestEndpoint();
  if (!ep) {
    return { direction: 'hold', confidence: 'low', reasoning: 'Ollama unavailable', usedOllama: false };
  }

  const prompt = `You are a crypto trading signal analyzer. Based on this market brief, output ONLY valid JSON.

${contextBrief}

Respond with ONLY this JSON (no explanation):
{"direction":"up"|"down"|"hold","confidence":"low"|"medium"|"high","reasoning":"max 10 words"}

Rules: Only output "high" confidence if multiple strong signals align. Default to "hold" if uncertain.`;

  try {
    // 32B model on 4090 needs slightly longer timeout but gives much better results
    const timeout = ep.name === '4090' ? 20000 : 10000;
    const result = await generate(prompt, { maxTokens: 80, temperature: 0.05, timeout });

    // Parse JSON from response
    const jsonMatch = result.text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);
      return { ...decision, usedOllama: true, model: result.model, endpoint: ep.name };
    }
    return { direction: 'hold', confidence: 'low', reasoning: 'Parse failed', usedOllama: true, endpoint: ep.name };
  } catch(e) {
    console.warn('[LocalLLM] Pre-score failed:', e.message);
    return { direction: 'hold', confidence: 'low', reasoning: e.message, usedOllama: false };
  }
}

module.exports = { isAvailable, listModels, generate, preScore, getBestEndpoint, ENDPOINTS };

// CLI test
if (require.main === module) {
  (async () => {
    console.log('Checking Ollama endpoints...');
    for (const ep of ENDPOINTS) {
      const up = await checkEndpoint(ep.host, ep.port);
      console.log(`  ${ep.name} (${ep.host}:${ep.port}) — ${up ? 'UP' : 'DOWN'} [${ep.model}]`);
    }

    const best = await getBestEndpoint();
    if (!best) { console.log('No endpoints available.'); return; }
    console.log(`\nBest endpoint: ${best.name} (${best.model})`);

    const models = await listModels();
    console.log('All models:', models.map(m => `${m.name} [${m._endpoint}]`).join(', '));

    console.log('\nTesting pre-score...');
    const brief = `BTC: $67,809 (+0.31% 5m)
Market: BTC UP/DOWN | UP: 0.31 / DOWN: 0.69 | 3m remaining
Momentum: 0.62 bullish | Odds compressing UP
Fear & Greed: 8 (Extreme Fear) → bearish bias
News: "ETF inflows positive" (+0.31)
Pre-score: 0.52 | Threshold: 0.65`;

    const result = await preScore(brief);
    console.log('Pre-score result:', JSON.stringify(result, null, 2));
  })();
}
