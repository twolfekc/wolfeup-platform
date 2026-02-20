'use strict';

const express = require('express');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRY = '7d';

function setJwtCookie(res, user) {
  const token = jwt.sign(
    { userId: user.id, email: user.email || null, username: user.username, isAdmin: !!(user.is_admin) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
  res.cookie('wolfeup_jwt', token, {
    domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const RP_NAME = 'Wolfeup';
const RP_ID = process.env.RP_ID || 'wolfeup.com';
const ORIGIN = process.env.ORIGIN || 'https://auth.wolfeup.com';

// AAGUID device name detection
const AAGUID_NAMES = {
  'fbfc3007154e4ecc8c0b6e020557d7bd': 'iCloud Keychain',
  '531126d6e717415c9b9082db8caf084a': 'Windows Hello',
  'adce000235bcc60a648b0b25f1f05503': 'Chrome on Mac',
  'bada5566a7aa401fb6a2b87b0dbc07f2': 'Chrome on Android',
  'de1e553d9d534f099d04db23f4a68cc4': 'YubiKey 5',
};

function getDeviceName(aaguid, userAgent) {
  const cleanId = aaguid ? aaguid.replace(/-/g, '').toLowerCase() : '';
  if (AAGUID_NAMES[aaguid]) return AAGUID_NAMES[aaguid];
  if (AAGUID_NAMES[cleanId]) return AAGUID_NAMES[cleanId];
  if (/iPhone|iPad/.test(userAgent)) return 'iPhone/iPad (Face ID)';
  if (/Mac/.test(userAgent) && !/iPhone|iPad/.test(userAgent)) return 'Mac (Touch ID)';
  if (/Windows/.test(userAgent)) return 'Windows Hello';
  if (/Android/.test(userAgent)) return 'Android Fingerprint';
  return 'Passkey';
}

// Helper: require auth for endpoints that need a logged-in user
function requireSession(req, res, next) {
  // Try JWT cookie first
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)wolfeup_jwt=([^;]+)/);
  if (match) {
    try {
      const decoded = jwt.verify(decodeURIComponent(match[1]), JWT_SECRET);
      if (decoded && decoded.userId) {
        req.jwtUserId = decoded.userId;
        // Sync to session so challenge storage (passkeyChallenge) works
        if (req.session && !req.session.userId) {
          req.session.userId = decoded.userId;
        }
        return next();
      }
    } catch (e) { /* invalid JWT */ }
  }
  // Fall back to session
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Must be logged in to register a passkey' });
}

// Get userId from request (JWT or session)
function getSessionUserId(req) {
  return req.jwtUserId || (req.session && req.session.userId) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANONYMOUS PASSKEY REGISTRATION (no account needed)
// POST /auth/passkey/register/anon/options — returns challenge for new-account passkey
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register/anon/options', async (req, res) => {
  const { displayName, email } = req.body;

  if (!displayName || displayName.trim().length < 1) {
    return res.status(400).json({ error: 'displayName is required' });
  }
  if (displayName.trim().length > 64) {
    return res.status(400).json({ error: 'Display name must be 64 characters or fewer' });
  }

  const normalizedEmail = email && String(email).trim()
    ? String(email).trim().toLowerCase()
    : null;

  // Generate a temporary user ID for this registration ceremony
  const tempUserId = uuidv4();
  const sanitizedName = displayName.trim();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(tempUserId),
    userName: normalizedEmail || (sanitizedName.includes('@') ? sanitizedName : sanitizedName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '') + '@wolfeup.com'),
    userDisplayName: sanitizedName,
    timeout: 120000,
    attestationType: 'none',
    excludeCredentials: [], // no account yet, nothing to exclude
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  // Store challenge + temp user info in session
  req.session.anonPasskeyChallenge = options.challenge;
  req.session.anonUserId = tempUserId;
  req.session.anonDisplayName = sanitizedName;
  req.session.anonEmail = normalizedEmail;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

// POST /auth/passkey/register/anon/options/platform — platform-only (iCloud Keychain / Face ID / Windows Hello)
router.post('/register/anon/options/platform', async (req, res) => {
  const { displayName, email } = req.body;

  if (!displayName || displayName.trim().length < 1) {
    return res.status(400).json({ error: 'displayName is required' });
  }
  if (displayName.trim().length > 64) {
    return res.status(400).json({ error: 'Display name must be 64 characters or fewer' });
  }

  const normalizedEmail = email && String(email).trim()
    ? String(email).trim().toLowerCase()
    : null;

  const tempUserId = uuidv4();
  const sanitizedName = displayName.trim();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(tempUserId),
    userName: normalizedEmail || (sanitizedName.includes('@') ? sanitizedName : sanitizedName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '') + '@wolfeup.com'),
    userDisplayName: sanitizedName,
    timeout: 120000,
    attestationType: 'none',
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  req.session.anonPasskeyChallenge = options.challenge;
  req.session.anonUserId = tempUserId;
  req.session.anonDisplayName = sanitizedName;
  req.session.anonEmail = normalizedEmail;
  req.session.anonPlatformOnly = true;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

// POST /auth/passkey/register/anon/verify — verify and create the account
router.post('/register/anon/verify', async (req, res) => {
  const db = req.app.locals.db;
  const { body } = req;

  const expectedChallenge = req.session.anonPasskeyChallenge;
  const tempUserId = req.session.anonUserId;
  const displayName = req.session.anonDisplayName;
  const anonEmail = req.session.anonEmail || null;

  if (!expectedChallenge || !tempUserId || !displayName) {
    return res.status(400).json({ error: 'No pending anonymous registration. Request options first.' });
  }

  // Clear session state
  delete req.session.anonPasskeyChallenge;
  delete req.session.anonUserId;
  delete req.session.anonDisplayName;
  delete req.session.anonEmail;
  delete req.session.anonPlatformOnly;

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey registration verification failed' });
    }

    const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
    const userAgent = req.headers['user-agent'] || '';
    const detectedName = getDeviceName(aaguid, userAgent);

    // Build a unique username from the display name
    // Sanitize: lowercase, replace spaces/special chars with _, truncate
    let baseUsername = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 28);
    if (!baseUsername) baseUsername = 'user';

    // Ensure unique username (append random suffix if needed)
    let username = baseUsername;
    let attempts = 0;
    while (true) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (!existing) break;
      username = `${baseUsername}_${Math.floor(Math.random() * 9000 + 1000)}`;
      if (++attempts > 10) {
        username = `${baseUsername}_${Date.now().toString(36)}`;
        break;
      }
    }

    // Link to existing account by email when provided; otherwise create passkey-only account
    let userId = tempUserId;
    let userEmail = anonEmail;
    let userUsername = username;

    if (anonEmail) {
      const existingByEmail = db.prepare('SELECT id, username, email, is_admin FROM users WHERE email = ?').get(anonEmail);
      if (existingByEmail) {
        userId = existingByEmail.id;
        userEmail = existingByEmail.email;
        userUsername = existingByEmail.username;
      }
    }

    if (userId === tempUserId) {
      const finalEmail = anonEmail || `${tempUserId}@passkey.local`;
      db.prepare(
        'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, NULL)'
      ).run(tempUserId, username, finalEmail);
      userEmail = finalEmail;
    }

    // Store the passkey
    const pkId = uuidv4();
    const credentialIdB64 = Buffer.from(credential.id).toString('base64url');
    const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64url');
    const transports = body.response?.transports ? JSON.stringify(body.response.transports) : null;

    db.prepare(`
      INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_name, transports, aaguid, backup_eligible, backup_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pkId,
      userId,
      credentialIdB64,
      publicKeyB64,
      credential.counter,
      detectedName,
      transports,
      aaguid || null,
      credentialDeviceType === 'multiDevice' ? 1 : 0,
      credentialBackedUp ? 1 : 0
    );

    // Auto-login the new user
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });

      req.session.userId = userId;
      req.session.username = userUsername;

      db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(userId);

      // Set JWT cookie for cross-subdomain SSO
      setJwtCookie(res, { id: userId, username: userUsername, email: userEmail });

      res.status(201).json({
        ok: true,
        user: {
          id: userId,
          username: userUsername,
          displayName,
          passkeyDevice: detectedName,
        },
      });
    });
  } catch (err) {
    console.error('[passkey/register/anon/verify]', err);
    res.status(400).json({ error: err.message || 'Verification failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING SESSION-BASED PASSKEY REGISTRATION (account already logged in)
// ─────────────────────────────────────────────────────────────────────────────

// GET /auth/passkey/register/options (backwards compat)
router.get('/register/options', requireSession, async (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(getSessionUserId(req));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existingPasskeys = db.prepare(
    'SELECT credential_id FROM passkeys WHERE user_id = ?'
  ).all(user.id);

  const excludeCredentials = existingPasskeys.map((pk) => ({
    id: Buffer.from(pk.credential_id, 'base64url'),
    type: 'public-key',
    transports: ['internal'],
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(user.id),
    userName: user.email || (user.username + '@wolfeup.com'),
    userDisplayName: user.username,
    timeout: 60000,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
      authenticatorAttachment: undefined,
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  req.session.passkeyChallenge = options.challenge;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

// POST /auth/passkey/register/options
router.post('/register/options', requireSession, async (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(getSessionUserId(req));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existingPasskeys = db.prepare(
    'SELECT credential_id FROM passkeys WHERE user_id = ?'
  ).all(user.id);

  const excludeCredentials = existingPasskeys.map((pk) => ({
    id: Buffer.from(pk.credential_id, 'base64url'),
    type: 'public-key',
    transports: ['internal'],
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(user.id),
    userName: user.email || (user.username + '@wolfeup.com'),
    userDisplayName: user.username,
    timeout: 60000,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
      authenticatorAttachment: undefined,
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  req.session.passkeyChallenge = options.challenge;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

// POST /auth/passkey/register/verify  (session-based, existing user)
router.post('/register/verify', requireSession, async (req, res) => {
  const db = req.app.locals.db;
  const { body } = req;
  const { deviceName } = req.body;

  const expectedChallenge = req.session.passkeyChallenge;
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'No challenge found. Request options first.' });
  }

  delete req.session.passkeyChallenge;

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey registration verification failed' });
    }

    const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;

    const userAgent = req.headers['user-agent'] || '';
    const detectedName = deviceName || getDeviceName(aaguid, userAgent);

    const pkId = uuidv4();
    const credentialIdB64 = Buffer.from(credential.id).toString('base64url');
    const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64url');
    const transports = body.response?.transports ? JSON.stringify(body.response.transports) : null;

    db.prepare(`
      INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_name, transports, aaguid, backup_eligible, backup_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pkId,
      getSessionUserId(req),
      credentialIdB64,
      publicKeyB64,
      credential.counter,
      detectedName,
      transports,
      aaguid || null,
      credentialDeviceType === 'multiDevice' ? 1 : 0,
      credentialBackedUp ? 1 : 0
    );

    res.json({ ok: true, passkeyId: pkId });
  } catch (err) {
    console.error('[passkey/register/verify]', err);
    res.status(400).json({ error: err.message || 'Verification failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PASSKEY LOGIN
// ─────────────────────────────────────────────────────────────────────────────

// GET /auth/passkey/login/options
router.get('/login/options', async (req, res) => {
  const db = req.app.locals.db;

  const { username } = req.query;
  let allowCredentials = [];

  if (username) {
    const user = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username.toLowerCase(), username.toLowerCase());

    if (user) {
      const passkeys = db.prepare(
        'SELECT credential_id, transports FROM passkeys WHERE user_id = ?'
      ).all(user.id);

      allowCredentials = passkeys.map((pk) => ({
        id: Buffer.from(pk.credential_id, 'base64url'),
        type: 'public-key',
        transports: pk.transports ? JSON.parse(pk.transports) : undefined,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    timeout: 120000,
    userVerification: 'required',
    allowCredentials,
  });

  req.session.passkeyChallenge = options.challenge;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

// POST /auth/passkey/login/verify
router.post('/login/verify', async (req, res) => {
  const db = req.app.locals.db;
  const { body } = req;

  const expectedChallenge = req.session.passkeyChallenge;
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'No challenge found. Request options first.' });
  }

  delete req.session.passkeyChallenge;

  try {
    const credentialId = body.id || body.rawId;
    const credIdB64 = typeof credentialId === 'string'
      ? credentialId
      : Buffer.from(credentialId).toString('base64url');

    const passkey = db.prepare(
      'SELECT * FROM passkeys WHERE credential_id = ?'
    ).get(credIdB64);

    if (!passkey) {
      return res.status(400).json({ error: 'Passkey not recognized' });
    }

    const publicKey = Buffer.from(passkey.public_key, 'base64url');
    const transports = passkey.transports ? JSON.parse(passkey.transports) : [];

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: Buffer.from(passkey.credential_id, 'base64url'),
        publicKey,
        counter: passkey.counter,
        transports,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return res.status(401).json({ error: 'Passkey authentication failed' });
    }

    db.prepare(
      'UPDATE passkeys SET counter = ?, last_used = unixepoch() WHERE id = ?'
    ).run(verification.authenticationInfo.newCounter, passkey.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(passkey.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });

      req.session.userId = user.id;
      req.session.username = user.username;

      db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

      // Set JWT cookie for cross-subdomain SSO
      setJwtCookie(res, user);

      res.json({
        ok: true,
        user: { id: user.id, username: user.username, email: user.email },
      });
    });
  } catch (err) {
    console.error('[passkey/login/verify]', err);
    res.status(400).json({ error: err.message || 'Authentication failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PASSKEY MANAGEMENT (requires session)
// ─────────────────────────────────────────────────────────────────────────────

// GET /auth/passkey/list
router.get('/list', requireSession, (req, res) => {
  const db = req.app.locals.db;
  const passkeys = db.prepare(
    'SELECT id, device_name, created_at, last_used FROM passkeys WHERE user_id = ? ORDER BY created_at DESC'
  ).all(getSessionUserId(req));
  res.json({ passkeys });
});

// PATCH /auth/passkey/:id/rename
router.patch('/:id/rename', requireSession, (req, res) => {
  const db = req.app.locals.db;
  const { deviceName } = req.body;
  if (!deviceName || deviceName.length > 64) return res.status(400).json({ error: 'Invalid name' });
  const result = db.prepare(
    'UPDATE passkeys SET device_name = ? WHERE id = ? AND user_id = ?'
  ).run(deviceName, req.params.id, getSessionUserId(req));
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /auth/passkey/:id
router.delete('/:id', requireSession, (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(getSessionUserId(req));
  const pkCount = db.prepare('SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?').get(getSessionUserId(req));
  if (!user.password_hash && pkCount.cnt <= 1) {
    return res.status(400).json({ error: 'Cannot remove your only passkey — set a password first.' });
  }
  const result = db.prepare(
    'DELETE FROM passkeys WHERE id = ? AND user_id = ?'
  ).run(req.params.id, getSessionUserId(req));
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Platform-specific registration options (session required — for logged-in users adding a second passkey)
router.post('/register/options/platform', requireSession, async (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(getSessionUserId(req));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existingPasskeys = db.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?').all(user.id);
  const excludeCredentials = existingPasskeys.map((pk) => ({
    id: Buffer.from(pk.credential_id, 'base64url'),
    type: 'public-key',
    transports: ['internal'],
  }));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID: RP_ID,
    userID: Buffer.from(user.id), userName: user.email || (user.username + '@wolfeup.com'), userDisplayName: user.username,
    timeout: 60000, attestationType: 'none', excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required', requireResidentKey: true,
      userVerification: 'required', authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257],
  });
  req.session.passkeyChallenge = options.challenge;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

router.get('/register/options/platform', requireSession, async (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(getSessionUserId(req));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existingPasskeys = db.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?').all(user.id);
  const excludeCredentials = existingPasskeys.map((pk) => ({
    id: Buffer.from(pk.credential_id, 'base64url'),
    type: 'public-key',
    transports: ['internal'],
  }));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID: RP_ID,
    userID: Buffer.from(user.id), userName: user.email || (user.username + '@wolfeup.com'), userDisplayName: user.username,
    timeout: 60000, attestationType: 'none', excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required', requireResidentKey: true,
      userVerification: 'required', authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257],
  });
  req.session.passkeyChallenge = options.challenge;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

// GET /auth/passkey/login/options/platform
router.get('/login/options/platform', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID, timeout: 120000, userVerification: 'required',
    allowCredentials: [],
  });
  req.session.passkeyChallenge = options.challenge;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json(options);
  });
});

module.exports = router;
