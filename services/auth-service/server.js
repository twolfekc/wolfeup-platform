'use strict';

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const Database = require('better-sqlite3');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || '';

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting for auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
});
const optionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
});
app.use('/auth/login', loginLimiter);
app.use('/auth/register', loginLimiter);

const PORT = process.env.PORT || 4000;
const DB_PATH = process.env.DB_PATH || '/data/auth.db';
const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme-use-env-var-in-production';
const AUTH_SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create schema (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    google_id TEXT,
    apple_id TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login INTEGER
  );

  CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    device_name TEXT,
    transports TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used INTEGER,
    aaguid TEXT,
    backup_eligible INTEGER DEFAULT 0,
    backup_state INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
  CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);
`);

// Add new columns to existing DB (safe)
try { db.exec('ALTER TABLE users ADD COLUMN google_id TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN apple_id TEXT'); } catch(e) {}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id)'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN display_name TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch(e) {}

// Make db available globally
app.locals.db = db;

// Trust proxy (behind nginx/Cloudflare)
app.set('trust proxy', 1);

// Cookie parser (needed for JWT checks on static pages)
app.use(cookieParser());

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^https?:\/\/([\w-]+\.)?wolfeup\.com(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (/^https?:\/\/appleid\.apple\.com$/.test(origin)) {
      return callback(null, true);
    }
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: process.env.DB_PATH ? require('path').dirname(process.env.DB_PATH) : '/data',
  concurrentDB: true,
});

app.use(session({
  name: 'wolfeup_sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
    secure: process.env.NODE_ENV === 'production' ? 'auto' : false,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000,
  },
}));

// ── Google OAuth (passport) ──────────────────────────────────────────────────
const { router: googleRouter, initGoogleOAuth } = require('./routes/google');
initGoogleOAuth(app);

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const appleRoutes = require('./routes/apple');

app.use('/auth', authRoutes);
app.use('/auth/passkey', (_req, res) => {
  res.status(410).json({ error: 'Passkey authentication is disabled. Use Google, Apple, or email/password.' });
});
app.use('/auth/google', googleRouter);
app.use('/auth/apple', appleRoutes);
app.use('/admin', adminRoutes);

// ── Protect static admin pages ──────────────────────────────────────────────
// profile.html and admin.html require admin JWT
const requireAdmin = require('./middleware/requireAdmin');

app.get('/profile.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Root page: if user has valid admin JWT, show index.html; otherwise redirect to mission control
app.get('/', (req, res) => {
  const token = req.cookies?.wolfeup_jwt;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.isAdmin) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
      }
    } catch (_) { /* invalid token */ }
    // Authenticated but not admin — redirect to mission control
    return res.redirect('https://mission.wolfeup.com');
  }
  // Not authenticated — show sign-in page (index.html has the OAuth buttons)
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve remaining static files (CSS, JS, images etc — but NOT .html files directly)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // We handle / above
  extensions: [], // Don't auto-resolve .html
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[auth-service] Listening on port ${PORT}`);
  console.log(`[auth-service] DB: ${DB_PATH}`);
  console.log(`[auth-service] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[auth-service] Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'ENABLED' : 'STUB (not configured)'}`);
});

module.exports = app;
