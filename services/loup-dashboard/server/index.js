const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 5050;
// Data proxy URL - points to the gateway data relay
const DATA_URL = process.env.DATA_URL || 'http://localhost:5051';

const state = {
  startTime: Date.now(),
  sessions: [],
  nodes: [],
  crons: [],
  lastUpdated: null,
  errors: {}
};

const events = [];
const MAX_EVENTS = 200;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

async function fetchJSON(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    mod.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function poll() {
  const [sessions, nodes, crons] = await Promise.all([
    fetchJSON(`${DATA_URL}/sessions`),
    fetchJSON(`${DATA_URL}/nodes`),
    fetchJSON(`${DATA_URL}/crons`),
  ]);

  if (sessions) { state.sessions = sessions.sessions || sessions || []; delete state.errors.sessions; }
  else state.errors.sessions = 'unavailable';

  if (nodes) { state.nodes = nodes.nodes || nodes || []; delete state.errors.nodes; }
  else state.errors.nodes = 'unavailable';

  if (crons) { state.crons = crons.jobs || crons || []; delete state.errors.crons; }
  else state.errors.crons = 'unavailable';

  state.lastUpdated = Date.now();
  broadcast({ type: 'state', state: getPublicState() });
}

function getPublicState() {
  return {
    uptime: Date.now() - state.startTime,
    sessions: state.sessions,
    nodes: state.nodes,
    crons: state.crons,
    lastUpdated: state.lastUpdated,
    errors: state.errors,
    system: {
      load: os.loadavg(), memFree: os.freemem(),
      memTotal: os.totalmem(), cpus: os.cpus().length
    }
  };
}

const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: Date.now() - state.startTime, clients: wss.clients.size }));
    return;
  }
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getPublicState()));
    return;
  }
  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(events.slice(-100)));
    return;
  }
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
  ws.send(JSON.stringify({ type: 'init', state: getPublicState(), events: events.slice(-50) }));
  ws.on('error', () => {});
});

setInterval(poll, 5000);
poll();
setInterval(() => broadcast({ type: 'heartbeat', ts: Date.now(), clients: wss.clients.size }), 3000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🐺 Loup Agent Dashboard running on port ${PORT}`);
  console.log(`   Data relay: ${DATA_URL}`);
});
