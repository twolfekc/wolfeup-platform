#!/usr/bin/env node
/**
 * Loup Event Bridge v3
 * - Real-time transcript streaming
 * - Full historical usage scan on startup + periodic refresh
 * - Cron/session status polling
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://loup_dashboard:5050';
const DASHBOARD_HOST = process.env.DASHBOARD_HOST || '';
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(process.env.HOME, '.openclaw/agents/main/sessions');
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const POLL_INTERVAL = 3000;
const USAGE_SCAN_INTERVAL = 60000; // Full usage scan every 60s
const INITIAL_TAIL_BYTES = 8192;

const filePositions = new Map();
const seenFiles = new Set();

function post(urlStr, data) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify(data);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (DASHBOARD_HOST) headers['Host'] = DASHBOARD_HOST;
    const req = mod.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST', headers, timeout: 10000
    }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b)); });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(body);
  });
}

function get(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const headers = {};
    if (GATEWAY_TOKEN) headers['Authorization'] = `Bearer ${GATEWAY_TOKEN}`;
    const req = mod.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'GET', headers, timeout: 5000
    }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function ingest(event) { post(`${DASHBOARD_URL}/api/ingest`, event); }

// ─── Full Historical Usage Scan ───
function scanAllUsage() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl')).map(f => path.join(SESSIONS_DIR, f));
    
    const models = {};
    const hourly = {}; // "YYYY-MM-DD HH" -> { cost, calls, tokens_in, tokens_out }
    const daily = {};  // "YYYY-MM-DD" -> { cost, calls, tokens_in, tokens_out }
    const sessions = {}; // sessionId -> { model, calls, cost, tokens, firstSeen, lastSeen }
    let totalCost = 0, totalCalls = 0, totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;

    for (const f of files) {
      const sessionId = path.basename(f, '.jsonl');
      const lines = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const d = JSON.parse(line);
          if (d.type !== 'message' || !d.message || d.message.role !== 'assistant') continue;
          
          const msg = d.message;
          const usage = msg.usage || {};
          const costObj = usage.cost || {};
          const cost = typeof costObj === 'object' ? (costObj.total || 0) : 0;
          let model = msg.model || 'unknown';
          // Normalize
          model = model.replace('openai-codex/', '').replace('openai/', '');
          
          const inp = usage.input || 0;
          const out = usage.output || 0;
          const cr = usage.cacheRead || 0;
          const cw = usage.cacheWrite || 0;
          const ts = d.timestamp ? new Date(d.timestamp) : new Date();
          const dateKey = ts.toISOString().slice(0, 10);
          const hourKey = ts.toISOString().slice(0, 13);

          // Model stats
          if (!models[model]) models[model] = { calls: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
          models[model].calls++;
          models[model].cost += cost;
          models[model].input += inp;
          models[model].output += out;
          models[model].cacheRead += cr;
          models[model].cacheWrite += cw;

          // Hourly
          if (!hourly[hourKey]) hourly[hourKey] = { cost: 0, calls: 0, input: 0, output: 0 };
          hourly[hourKey].cost += cost;
          hourly[hourKey].calls++;
          hourly[hourKey].input += inp;
          hourly[hourKey].output += out;

          // Daily
          if (!daily[dateKey]) daily[dateKey] = { cost: 0, calls: 0, input: 0, output: 0 };
          daily[dateKey].cost += cost;
          daily[dateKey].calls++;
          daily[dateKey].input += inp;
          daily[dateKey].output += out;

          // Session
          if (!sessions[sessionId]) sessions[sessionId] = { models: {}, calls: 0, cost: 0, input: 0, output: 0, firstSeen: ts.toISOString(), lastSeen: ts.toISOString() };
          sessions[sessionId].calls++;
          sessions[sessionId].cost += cost;
          sessions[sessionId].input += inp;
          sessions[sessionId].output += out;
          sessions[sessionId].lastSeen = ts.toISOString();
          sessions[sessionId].models[model] = (sessions[sessionId].models[model] || 0) + 1;

          totalCost += cost;
          totalCalls++;
          totalInput += inp;
          totalOutput += out;
          totalCacheRead += cr;
          totalCacheWrite += cw;
        } catch { /* skip bad lines */ }
      }
    }

    // Calculate burn rates
    const dailyKeys = Object.keys(daily).sort();
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const todayCost = daily[todayKey]?.cost || 0;
    const todayCalls = daily[todayKey]?.calls || 0;
    
    // Last 7 days average
    const last7 = dailyKeys.slice(-7);
    const avg7dayCost = last7.reduce((s, k) => s + (daily[k]?.cost || 0), 0) / Math.max(1, last7.length);
    
    // Hours active today
    const todayHours = Object.keys(hourly).filter(k => k.startsWith(todayKey)).length;

    const usageData = {
      ts: Date.now(),
      totals: { cost: totalCost, calls: totalCalls, input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite },
      models,
      plans: {
        'gpt-5.3-codex': { provider: 'OpenAI', plan: 'Plus ($20/mo)', limit: 20, spent: models['gpt-5.3-codex']?.cost || 0, calls: models['gpt-5.3-codex']?.calls || 0 },
        'gpt-5.3-codex-spark': { provider: 'OpenAI', plan: 'Plus ($20/mo)', limit: 20, spent: models['gpt-5.3-codex-spark']?.cost || 0, calls: models['gpt-5.3-codex-spark']?.calls || 0 }
      },
      today: { cost: todayCost, calls: todayCalls, hoursActive: todayHours },
      burnRate: { daily: avg7dayCost, projected30d: avg7dayCost * 30 },
      daily: Object.entries(daily).sort((a,b) => a[0].localeCompare(b[0])).slice(-14).map(([d, v]) => ({ date: d, ...v })),
      hourly: Object.entries(hourly).sort((a,b) => a[0].localeCompare(b[0])).slice(-48).map(([h, v]) => ({ hour: h, ...v })),
      sessionCount: Object.keys(sessions).length,
      topSessions: Object.entries(sessions).sort((a,b) => b[1].cost - a[1].cost).slice(0, 10).map(([id, v]) => ({ id: id.slice(0, 8), ...v }))
    };

    return usageData;
  } catch (e) {
    console.error('Usage scan failed:', e.message);
    return null;
  }
}

async function pushUsage() {
  const usage = scanAllUsage();
  if (usage) {
    await post(`${DASHBOARD_URL}/api/usage`, usage);
    console.log(`📊 Usage scan: $${usage.totals.cost.toFixed(2)} total, ${usage.totals.calls} calls`);
  }
}

// ─── Transcript Parsing ───
function parseTranscriptLine(line, sessionFile) {
  try {
    const entry = JSON.parse(line);
    const sessionName = path.basename(sessionFile, '.jsonl').slice(0, 8);
    if (entry.type !== 'message' || !entry.message) return null;
    const msg = entry.message;
    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

    if (msg.role === 'user') {
      let text = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map(c => c.text || '').filter(Boolean).join(' ') : '';
      if (!text || text.length < 2 || text.startsWith('Read HEARTBEAT.md')) return null;
      return { type: 'message', direction: 'in', text: text.slice(0, 300), session: sessionName, ts };
    }

    if (msg.role === 'assistant') {
      const content = Array.isArray(msg.content) ? msg.content : [];
      const events = [];
      for (const c of content) {
        if (c.type === 'thinking' && c.thinking) events.push({ type: 'thinking', text: c.thinking.slice(0, 200), session: sessionName, ts });
        if (c.type === 'toolCall') events.push({ type: 'tool_call', tool: c.name, params: (typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {})).slice(0, 200), session: sessionName, ts });
      }
      const text = content.filter(c => c.type === 'text').map(c => c.text || '').join(' ');
      if (text.trim()) {
        const usage = msg.usage || {};
        const costObj = usage.cost || {};
        events.push({
          type: 'response', text: text.slice(0, 300), session: sessionName, model: msg.model || '', ts,
          tokens: { input: usage.input || 0, output: usage.output || 0, cacheRead: usage.cacheRead || 0, cacheWrite: usage.cacheWrite || 0 },
          cost: typeof costObj === 'object' ? (costObj.total || 0) : 0
        });
      }
      return events.length === 1 ? events[0] : events.length > 0 ? events : null;
    }

    if (msg.role === 'toolResult') {
      let text = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map(c => c.text || '').filter(Boolean).join(' ') : '';
      return { type: 'tool_result', tool: msg.toolName || 'unknown', result: text.slice(0, 200), session: sessionName, ts, isError: msg.isError || false };
    }

    return null;
  } catch { return null; }
}

function tailFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const currentPos = filePositions.get(filePath) || 0;
    if (stat.size <= currentPos) return;
    const stream = fs.createReadStream(filePath, { start: currentPos, encoding: 'utf8' });
    let buffer = '';
    stream.on('data', c => buffer += c);
    stream.on('end', () => {
      filePositions.set(filePath, stat.size);
      for (const line of buffer.split('\n').filter(l => l.trim())) {
        const event = parseTranscriptLine(line, filePath);
        if (event) { if (Array.isArray(event)) event.forEach(e => ingest(e)); else ingest(event); }
      }
    });
  } catch { }
}

function scanSessions() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl')).map(f => path.join(SESSIONS_DIR, f));
    const sorted = files.map(f => { try { const s = fs.statSync(f); return { path: f, mtime: s.mtimeMs, size: s.size }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, 20);
    for (const { path: fp, size } of sorted) {
      if (!seenFiles.has(fp)) { filePositions.set(fp, Math.max(0, size - INITIAL_TAIL_BYTES)); seenFiles.add(fp); }
      tailFile(fp);
    }
  } catch { }
}

function watchSessionsDir() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.watch(SESSIONS_DIR, { persistent: true }, (_, filename) => {
      if (filename && filename.endsWith('.jsonl')) {
        const fp = path.join(SESSIONS_DIR, filename);
        if (!seenFiles.has(fp)) { try { const s = fs.statSync(fp); filePositions.set(fp, Math.max(0, s.size - INITIAL_TAIL_BYTES)); seenFiles.add(fp); } catch { return; } }
        setTimeout(() => tailFile(fp), 100);
      }
    });
    console.log(`📂 Watching ${SESSIONS_DIR}`);
  } catch (e) { console.error('fs.watch failed:', e.message); }
}

async function pollCrons() {
  try {
    const data = await get(`${GATEWAY_URL}/api/cron/list`);
    if (data && data.jobs) {
      ingest({ type: 'cron_status', jobs: data.jobs.map(j => ({ id: j.id, name: j.name || j.id?.slice(0, 8), enabled: j.enabled, schedule: j.schedule, lastRun: j.lastRunAt, model: j.payload?.model })), ts: Date.now() });
    }
  } catch { }
}

async function pollSessions() {
  try {
    const data = await get(`${GATEWAY_URL}/api/sessions`);
    if (data && data.sessions) {
      ingest({ type: 'session_status', sessions: data.sessions.map(s => ({ key: s.key, model: s.model, active: s.active, lastActivity: s.lastActivity, channel: s.channel })), count: data.sessions.length, ts: Date.now() });
    }
  } catch { }
}

// ─── Main ───
console.log('🐺 Loup Event Bridge v3');
console.log(`   Dashboard: ${DASHBOARD_URL}`);
console.log(`   Sessions:  ${SESSIONS_DIR}`);

scanSessions();
watchSessionsDir();
setInterval(scanSessions, POLL_INTERVAL);
setInterval(pollCrons, 30000);
setInterval(pollSessions, 30000);
setInterval(pushUsage, USAGE_SCAN_INTERVAL);

setTimeout(pollCrons, 2000);
setTimeout(pollSessions, 2000);
setTimeout(pushUsage, 3000); // Initial usage scan

ingest({ type: 'system', text: '🐺 Event bridge v3 — live streaming + usage tracking', ts: Date.now() });
console.log('✅ Running');
