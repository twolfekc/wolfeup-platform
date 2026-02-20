const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 5050;
const MAX_EVENTS = 500;
const events = [];
const stats = {
  startTime: Date.now(),
  totalEvents: 0,
  eventsByType: {},
  tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  costEstimate: 0,
  modelUsage: {},
  sessionsActive: 0,
  cronJobs: [],
  // Detailed usage data from historical scan
  usage: null
};

const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: Date.now() - stats.startTime, events: events.length, clients: wss.clients.size }));
    return;
  }

  if (req.url === '/api/ingest' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        ingestEvent(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"error":"bad json"}'); }
    });
    return;
  }

  // Bulk usage data ingest
  if (req.url === '/api/usage' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        stats.usage = JSON.parse(body);
        broadcast({ type: 'usage_update', usage: stats.usage });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"error":"bad json"}'); }
    });
    return;
  }

  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(events.slice(-100)));
    return;
  }

  if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...stats, uptime: Date.now() - stats.startTime, wsClients: wss.clients.size,
      memoryUsage: process.memoryUsage(), systemLoad: os.loadavg(),
      systemMemory: { total: os.totalmem(), free: os.freemem() }, cpus: os.cpus().length
    }));
    return;
  }

  if (req.url === '/api/system') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hostname: os.hostname(), platform: os.platform(), arch: os.arch(),
      uptime: os.uptime(), loadAvg: os.loadavg(), totalMem: os.totalmem(),
      freeMem: os.freemem(), cpus: os.cpus().length, nodeVersion: process.version
    }));
    return;
  }

  // Serve static
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(__dirname, '..', 'public', filePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', events: events.slice(-50), stats, usage: stats.usage }));
  ws.on('error', () => {});
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function ingestEvent(raw) {
  const event = { id: stats.totalEvents++, ts: raw.ts || Date.now(), type: raw.type || 'unknown', ...raw };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
  if (event.tokens) {
    stats.tokenUsage.input += event.tokens.input || 0;
    stats.tokenUsage.output += event.tokens.output || 0;
    stats.tokenUsage.cacheRead += event.tokens.cacheRead || 0;
    stats.tokenUsage.cacheWrite += event.tokens.cacheWrite || 0;
  }
  if (event.cost) stats.costEstimate += event.cost;
  if (event.model) stats.modelUsage[event.model] = (stats.modelUsage[event.model] || 0) + 1;
  broadcast({ type: 'event', event });
}

// Heartbeat
setInterval(() => {
  broadcast({
    type: 'heartbeat', ts: Date.now(),
    system: { load: os.loadavg(), memFree: os.freemem(), memTotal: os.totalmem(), uptime: os.uptime() },
    dashboard: { events: events.length, clients: wss.clients.size, totalEvents: stats.totalEvents }
  });
}, 5000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🐺 Loup Agent Dashboard running on port ${PORT}`);
});
