// server.js — DNS Ping Platform backend
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const dns = require('dns');
const dgram = require('dgram');
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const resolvers = require('./resolvers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5060;
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || 20;
const TEST_DOMAIN = 'example.com';
const TIMEOUT_MS = 3000;
const CYCLE_DELAY_MS = 2000; // delay between full cycles
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const MAX_HISTORY_POINTS = 360; // ~1 hour at 10s intervals

// Server location (detect or default)
const SERVER_LAT = parseFloat(process.env.SERVER_LAT) || 39.0438;
const SERVER_LNG = parseFloat(process.env.SERVER_LNG) || -77.4874;
const SERVER_CITY = process.env.SERVER_CITY || 'Ashburn, VA';

// ─── State ───────────────────────────────────────────────────────────────────
const results = new Map(); // id → { latency, min, max, sum, count, p_values[], status, lastUpdate, history[] }
let scanCount = 0;
let lastScanTime = null;
let scanning = false;

// Initialize results
resolvers.forEach(r => {
  results.set(r.id, {
    id: r.id,
    latency: null,
    min: Infinity,
    max: 0,
    sum: 0,
    count: 0,
    values: [],
    status: 'pending',
    lastUpdate: null,
    history: [],
  });
});

// ─── DNS Testing ─────────────────────────────────────────────────────────────

function buildDNSQuery(domain) {
  const parts = domain.split('.');
  const id = Buffer.alloc(2);
  id.writeUInt16BE(Math.floor(Math.random() * 65535));
  const flags = Buffer.from([0x01, 0x00]); // standard query, recursion desired
  const counts = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const qparts = [];
  for (const p of parts) {
    qparts.push(Buffer.from([p.length]));
    qparts.push(Buffer.from(p));
  }
  qparts.push(Buffer.from([0x00]));
  const qtype = Buffer.from([0x00, 0x01]); // A record
  const qclass = Buffer.from([0x00, 0x01]); // IN
  return Buffer.concat([id, flags, counts, ...qparts, qtype, qclass]);
}

function testDNSUDP(ip, timeout = TIMEOUT_MS) {
  return new Promise(resolve => {
    const client = dgram.createSocket('udp4');
    const query = buildDNSQuery(TEST_DOMAIN);
    const start = process.hrtime.bigint();
    let done = false;

    const finish = (latency, status) => {
      if (done) return;
      done = true;
      try { client.close(); } catch {}
      resolve({ latency, status });
    };

    const timer = setTimeout(() => finish(null, 'timeout'), timeout);

    client.on('message', () => {
      clearTimeout(timer);
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      finish(Math.round(elapsed * 100) / 100, 'online');
    });

    client.on('error', () => {
      clearTimeout(timer);
      finish(null, 'error');
    });

    client.send(query, 53, ip, err => {
      if (err) {
        clearTimeout(timer);
        finish(null, 'error');
      }
    });
  });
}

async function testDoH(url, timeout = TIMEOUT_MS) {
  const wireQuery = buildDNSQuery(TEST_DOMAIN).toString('base64url');
  const fullUrl = `${url}?dns=${wireQuery}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = process.hrtime.bigint();
  try {
    const resp = await fetch(fullUrl, {
      method: 'GET',
      headers: { Accept: 'application/dns-message' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { latency: null, status: 'error' };
    await resp.arrayBuffer();
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    return { latency: Math.round(elapsed * 100) / 100, status: 'online' };
  } catch {
    clearTimeout(timer);
    return { latency: null, status: 'timeout' };
  }
}

async function testResolver(resolver) {
  if (resolver.protocol === 'doh' && resolver.url) {
    return testDoH(resolver.url);
  }
  return testDNSUDP(resolver.ip);
}

// ─── Statistics ──────────────────────────────────────────────────────────────

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function updateStats(id, measurement) {
  const r = results.get(id);
  if (!r) return;

  r.latency = measurement.latency;
  r.status = measurement.status;
  r.lastUpdate = Date.now();

  if (measurement.latency !== null) {
    r.min = Math.min(r.min, measurement.latency);
    r.max = Math.max(r.max, measurement.latency);
    r.sum += measurement.latency;
    r.count++;
    r.values.push(measurement.latency);
    if (r.values.length > 1000) r.values = r.values.slice(-500);

    r.history.push({ t: Date.now(), v: measurement.latency });
    if (r.history.length > MAX_HISTORY_POINTS) {
      r.history = r.history.slice(-MAX_HISTORY_POINTS);
    }
  }
}

function getStats(id) {
  const r = results.get(id);
  if (!r) return null;
  const avg = r.count > 0 ? Math.round(r.sum / r.count * 100) / 100 : null;
  return {
    id: r.id,
    latency: r.latency,
    min: r.min === Infinity ? null : r.min,
    max: r.max || null,
    avg,
    p50: r.values.length ? percentile(r.values, 50) : null,
    p95: r.values.length ? percentile(r.values, 95) : null,
    p99: r.values.length ? percentile(r.values, 99) : null,
    status: r.status,
    count: r.count,
    lastUpdate: r.lastUpdate,
    history: r.history.slice(-60),
  };
}

// ─── Geo Distance ────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Scan Engine ─────────────────────────────────────────────────────────────

async function runBatch(batch) {
  return Promise.all(batch.map(async resolver => {
    try {
      const measurement = await testResolver(resolver);
      updateStats(resolver.id, measurement);
      return { id: resolver.id, ...measurement };
    } catch (e) {
      console.error(`Test error for ${resolver.id} (${resolver.name}):`, e.message);
      updateStats(resolver.id, { latency: null, status: 'error' });
      return { id: resolver.id, latency: null, status: 'error' };
    }
  }));
}

async function runScanCycle() {
  if (scanning) return;
  scanning = true;
  scanCount++;
  const startTime = Date.now();

  try {
    // Shuffle resolvers for fairness
    const shuffled = [...resolvers].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length; i += CONCURRENCY) {
      const batch = shuffled.slice(i, i + CONCURRENCY);
      await runBatch(batch);
    }

    lastScanTime = Date.now();
    const elapsed = ((lastScanTime - startTime) / 1000).toFixed(1);
    const online = [...results.values()].filter(r => r.status === 'online').length;
    console.log(`Scan #${scanCount}: ${resolvers.length} resolvers in ${elapsed}s — ${online} online, ${resolvers.length - online} failed/timeout [${wss.clients.size} clients]`);

    // Broadcast results
    broadcastResults();

    // Persist periodically
    if (scanCount % 5 === 0) persistHistory();
  } finally {
    scanning = false;
  }
}

function broadcastResults() {
  const payload = JSON.stringify({
    type: 'results',
    data: getFullResults(),
    meta: { scanCount, lastScanTime, serverLat: SERVER_LAT, serverLng: SERVER_LNG, serverCity: SERVER_CITY },
  });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

function getFullResults() {
  return resolvers.map(r => {
    const stats = getStats(r.id);
    const dist = haversine(SERVER_LAT, SERVER_LNG, r.lat, r.lng);
    return { ...r, ...stats, distance: Math.round(dist) };
  }).sort((a, b) => {
    if (a.latency === null && b.latency === null) return 0;
    if (a.latency === null) return 1;
    if (b.latency === null) return -1;
    return a.latency - b.latency;
  });
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function persistHistory() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    const data = {};
    results.forEach((v, k) => { data[k] = { min: v.min === Infinity ? null : v.min, max: v.max, count: v.count, sum: v.sum, history: v.history.slice(-120) }; });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('Persist error:', e.message);
  }
}

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    Object.entries(data).forEach(([id, saved]) => {
      const r = results.get(parseInt(id));
      if (!r) return;
      if (saved.min != null) r.min = saved.min;
      if (saved.max) r.max = saved.max;
      if (saved.count) { r.count = saved.count; r.sum = saved.sum; }
      if (saved.history) r.history = saved.history;
    });
    console.log('Loaded history from disk');
  } catch (e) {
    console.error('Load history error:', e.message);
  }
}

// ─── Continuous Scanning Loop ────────────────────────────────────────────────

async function scanLoop() {
  while (true) {
    try {
      await runScanCycle();
    } catch (e) {
      console.error('Scan error:', e.message);
    }
    await new Promise(r => setTimeout(r, CYCLE_DELAY_MS));
  }
}

// ─── API Routes ──────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/resolvers', (req, res) => {
  res.json(resolvers.map(r => ({
    ...r,
    distance: Math.round(haversine(SERVER_LAT, SERVER_LNG, r.lat, r.lng)),
  })));
});

app.get('/api/results', (req, res) => {
  res.json({
    results: getFullResults(),
    meta: { scanCount, lastScanTime, serverLat: SERVER_LAT, serverLng: SERVER_LNG, serverCity: SERVER_CITY, resolverCount: resolvers.length },
  });
});

app.get('/api/history/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const r = results.get(id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ id, history: r.history });
});

app.get('/api/export', (req, res) => {
  const rows = getFullResults();
  const header = 'Rank,Provider,Name,City,Country,Protocol,IP,Latency(ms),Min,Avg,P95,Status,Distance(km)\n';
  const csv = rows.map((r, i) =>
    `${i + 1},"${r.provider}","${r.name}","${r.city}","${r.country}","${r.protocol}","${r.ip}",${r.latency ?? ''},${r.min ?? ''},${r.avg ?? ''},${r.p95 ?? ''},"${r.status}",${r.distance}`
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=dns-results.csv');
  res.send(header + csv);
});

// ─── WebSocket ───────────────────────────────────────────────────────────────

wss.on('connection', ws => {
  // Send current state immediately
  ws.send(JSON.stringify({
    type: 'init',
    data: getFullResults(),
    meta: { scanCount, lastScanTime, serverLat: SERVER_LAT, serverLng: SERVER_LNG, serverCity: SERVER_CITY, resolverCount: resolvers.length },
  }));
});

// ─── Start ───────────────────────────────────────────────────────────────────

loadHistory();

server.listen(PORT, () => {
  console.log(`DNS Ping Platform running on http://0.0.0.0:${PORT}`);
  console.log(`Testing ${resolvers.length} resolvers with concurrency ${CONCURRENCY}`);
  console.log(`Server location: ${SERVER_CITY} (${SERVER_LAT}, ${SERVER_LNG})`);
  scanLoop();
});
