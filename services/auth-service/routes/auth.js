'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const SALT_ROUNDS = 12;
const HARDCODED_ADMIN_EMAIL = 'twolfekc@gmail.com';
const ADMIN_EMAILS = ['twolfekc@gmail.com', 'wolfeupkc@gmail.com'];

const JWT_SECRET = process.env.JWT_SECRET || '';
const AUTH_SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const JWT_EXPIRY_SECS = AUTH_SESSION_DAYS * 24 * 60 * 60;

// ─── Helper: set JWT cookie ────────────────────────────────────────────────────
function setJwtCookie(res, user) {
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
      isAdmin: !!(user.is_admin),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY_SECS }
  );
  res.cookie('wolfeup_jwt', token, {
    domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: JWT_EXPIRY_SECS * 1000,
  });
  return token;
}

// ─── Helper: get userId from JWT cookie or session ──────────────────────────
function getUserIdFromRequest(req) {
  // 1. Try JWT cookie
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)wolfeup_jwt=([^;]+)/);
  if (match) {
    try {
      const decoded = jwt.verify(decodeURIComponent(match[1]), JWT_SECRET);
      if (decoded && decoded.userId) return decoded.userId;
    } catch (e) { /* invalid/expired JWT */ }
  }
  // 2. Fall back to express-session
  if (req.session && req.session.userId) return req.session.userId;
  return null;
}

// ─── Helper: enforce admin on a user object ────────────────────────────────────
function enforceAdminOverride(user) {
  if (user && ADMIN_EMAILS.includes(user.email)) {
    user.is_admin = 1;
  }
  return user;
}

// GET /auth/check — for nginx auth_request and SSO validation
router.get('/check', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (userId) {
    const db = req.app.locals.db;
    const user = db.prepare(
      'SELECT id, username, email, display_name, is_admin FROM users WHERE id = ?'
    ).get(userId);
    if (user) {
      enforceAdminOverride(user);
      if (ADMIN_EMAILS.includes(user.email) && !user.is_admin) {
        db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
      }
      res.set('X-Auth-User', user.username);
      res.set('X-Auth-Email', user.email);
      res.set('X-Auth-Admin', user.is_admin ? '1' : '0');
      return res.status(200).json({ ok: true, user });
    }
  }
  res.status(401).json({ error: 'Unauthorized' });
});

// GET /auth/me — return current user info
router.get('/me', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const db = req.app.locals.db;
  const user = db.prepare(
    'SELECT id, username, email, display_name, is_admin, avatar_url, created_at, last_login FROM users WHERE id = ?'
  ).get(userId);

  if (!user) {
    req.session && req.session.destroy(() => {});
    return res.status(401).json({ error: 'User not found' });
  }

  enforceAdminOverride(user);

  const passkeyCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?'
  ).get(user.id);

  const googleLinked = db.prepare(
    'SELECT google_id FROM users WHERE id = ?'
  ).get(user.id);

  res.json({
    user: {
      ...user,
      // Convert Unix timestamps to milliseconds for JS Date compatibility
      created_at: user.created_at ? user.created_at * 1000 : null,
      last_login: user.last_login ? user.last_login * 1000 : null,
      passkeyCount: passkeyCount.cnt,
      googleLinked: !!(googleLinked && googleLinked.google_id),
    },
  });
});

// POST /auth/register — create account
router.post('/register', async (req, res) => {
  const { username, email, password, display_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }

  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3-32 characters' });
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, _, ., -' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = req.app.locals.db;

  try {
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username.toLowerCase(), email.toLowerCase());

    if (existing) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const id = uuidv4();
    const displayName = display_name || username;

    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
    const isAdmin = (userCount.cnt === 0 || ADMIN_EMAILS.includes(email.toLowerCase())) ? 1 : 0;

    db.prepare(
      'INSERT INTO users (id, username, email, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName, isAdmin);

    req.session.userId = id;
    req.session.username = username.toLowerCase();

    db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(id);

    const userObj = { id, username: username.toLowerCase(), email: email.toLowerCase(), display_name: displayName, is_admin: isAdmin };
    setJwtCookie(res, userObj);

    res.status(201).json({ ok: true, user: userObj });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login — password login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = req.app.locals.db;

  try {
    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? OR email = ?'
    ).get(username.toLowerCase(), username.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Password login not available for this account. Use passkey or Google sign-in.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    enforceAdminOverride(user);

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });

      req.session.userId = user.id;
      req.session.username = user.username;

      db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

      setJwtCookie(res, user);

      res.json({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          display_name: user.display_name,
          is_admin: user.is_admin,
        },
      });
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    // Clear JWT cookie (current name)
    res.clearCookie('wolfeup_jwt', {
      domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
      path: '/',
    });
    // Clear legacy cookie names for clients that still have them
    res.clearCookie('wolfeup_session', {
      domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
      path: '/',
    });
    res.clearCookie('wolfeup_sid', {
      domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
      path: '/',
    });
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

module.exports = router;
