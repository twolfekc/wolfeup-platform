'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const requireAdmin = require('../middleware/requireAdmin');
const router = express.Router();

const SALT_ROUNDS = 12;

// All admin routes require admin IP
router.use(requireAdmin);

// Fix 8: GET /admin/stats — stats for admin panel header
router.get('/stats', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  const passkeys = db.prepare('SELECT COUNT(*) as cnt FROM passkeys').get().cnt;
  const sessions = db.prepare("SELECT COUNT(*) as cnt FROM sessions WHERE expired > " + Date.now()).get().cnt;
  res.json({ users, passkeys, sessions });
});

// GET /admin/users — list all users
router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.created_at, u.last_login,
      (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) as passkey_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users });
});

// POST /admin/users — create user manually
router.post('/users', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: 'username and email are required' });
  }

  const db = req.app.locals.db;

  try {
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username.toLowerCase(), email.toLowerCase());

    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const id = uuidv4();
    const passwordHash = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;

    db.prepare(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, username.toLowerCase(), email.toLowerCase(), passwordHash);

    res.status(201).json({
      ok: true,
      user: { id, username: username.toLowerCase(), email: email.toLowerCase() },
    });
  } catch (err) {
    console.error('[admin/users POST]', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// DELETE /admin/users/:id — delete user
router.delete('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ ok: true });
});

// GET /admin/users/:id/passkeys — list passkeys for user
router.get('/users/:id/passkeys', (req, res) => {
  const db = req.app.locals.db;
  const passkeys = db.prepare(`
    SELECT id, credential_id, device_name, transports, created_at, last_used, aaguid, backup_eligible, backup_state
    FROM passkeys
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.params.id);

  res.json({ passkeys });
});

// DELETE /admin/users/:id/passkeys/:pkid — remove passkey
router.delete('/users/:id/passkeys/:pkid', (req, res) => {
  const db = req.app.locals.db;
  const result = db.prepare(
    'DELETE FROM passkeys WHERE id = ? AND user_id = ?'
  ).run(req.params.pkid, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Passkey not found' });
  }

  res.json({ ok: true });
});

module.exports = router;
