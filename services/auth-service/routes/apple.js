'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || '';
const AUTH_SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const JWT_EXPIRY_SECS = AUTH_SESSION_DAYS * 24 * 60 * 60;
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || '';
const APPLE_KEY_PATH = process.env.APPLE_KEY_PATH || '';
const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI || 'https://auth.wolfeup.com/auth/apple/callback';
const APPLE_SCOPE = process.env.APPLE_SCOPE || 'name email';
const APPLE_RESPONSE_MODE = process.env.APPLE_RESPONSE_MODE || 'form_post';
const APPLE_RESPONSE_TYPE = process.env.APPLE_RESPONSE_TYPE || 'code id_token';
const APPLE_STATE_TTL_MS = Number(process.env.APPLE_STATE_TTL_MS || 10 * 60 * 1000);
const DEFAULT_REDIRECT = 'https://mission.wolfeup.com';

function generateAppleClientSecret() {
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_KEY_PATH) return null;
  try {
    const privateKey = fs.readFileSync(APPLE_KEY_PATH, 'utf8');
    return jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      expiresIn: '5m',
      audience: 'https://appleid.apple.com',
      issuer: APPLE_TEAM_ID,
      subject: APPLE_CLIENT_ID,
      keyid: APPLE_KEY_ID,
    });
  } catch (err) {
    console.error('[apple] client_secret generation failed:', err.message);
    return null;
  }
}

const ADMIN_EMAILS = ['twolfekc@gmail.com', 'wolfeupkc@gmail.com'];

let jwksCache = { keys: null, fetchedAt: 0 };
const appleStateStore = new Map();

function b64urlToBuffer(input) {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(b64, 'base64');
}

async function fetchAppleJWKS() {
  const now = Date.now();
  if (jwksCache.keys && (now - jwksCache.fetchedAt) < 10 * 60 * 1000) return jwksCache.keys;

  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error(`Apple JWKS fetch failed (${res.status})`);
  const body = await res.json();
  if (!body || !Array.isArray(body.keys)) throw new Error('Invalid Apple JWKS payload');

  jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

function setJwtCookie(res, user) {
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
      isAdmin: !!user.is_admin,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY_SECS },
  );

  res.cookie('wolfeup_jwt', token, {
    domain: process.env.NODE_ENV === 'production' ? '.wolfeup.com' : undefined,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: JWT_EXPIRY_SECS * 1000,
  });
}

async function verifyAppleIdToken(idToken, expectedNonce) {
  const [headerB64] = idToken.split('.');
  if (!headerB64) throw new Error('Malformed Apple id_token');

  const header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8'));
  if (!header.kid || !header.alg) throw new Error('Apple token missing kid/alg');

  let keys = await fetchAppleJWKS();
  let jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) {
    jwksCache = { keys: null, fetchedAt: 0 };
    keys = await fetchAppleJWKS();
    jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  }
  if (!jwk) throw new Error('Apple signing key not found');

  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });

  const payload = jwt.verify(idToken, keyObject, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: APPLE_CLIENT_ID,
  });

  if (!payload || !payload.sub) throw new Error('Apple token missing subject');

  if (expectedNonce) {
    const rawNonce = expectedNonce;
    const hashedNonce = crypto.createHash('sha256').update(rawNonce).digest('hex');
    if (payload.nonce !== rawNonce && payload.nonce !== hashedNonce) {
      throw new Error('Apple nonce mismatch');
    }
  }

  return payload;
}


async function exchangeCodeForIdToken(code) {
  const clientSecret = generateAppleClientSecret();
  if (!clientSecret) {
    throw new Error('Apple client_secret is not configured (team/key settings missing)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: APPLE_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: APPLE_REDIRECT_URI,
  });

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    const msg = tokenJson.error_description || tokenJson.error || `Apple token exchange failed (${tokenRes.status})`;
    throw new Error(msg);
  }

  if (!tokenJson.id_token) {
    throw new Error('Apple token response missing id_token');
  }

  return tokenJson.id_token;
}

function ensureAppleConfigured(res) {
  if (!APPLE_CLIENT_ID) {
    res.status(503).json({ error: 'Apple sign-in not configured (APPLE_CLIENT_ID missing)' });
    return false;
  }
  return true;
}

function buildUniqueUsername(db, source) {
  const base = String(source || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'user';

  let candidate = base;
  let attempts = 0;
  while (attempts < 20) {
    const found = db.prepare('SELECT id FROM users WHERE username = ?').get(candidate);
    if (!found) return candidate;
    candidate = `${base}_${Math.floor(Math.random() * 9000 + 1000)}`;
    attempts += 1;
  }
  return `${base}_${Date.now().toString(36).slice(-6)}`;
}

function finishLogin(req, res, user) {
  const db = req.app.locals.db;

  if (ADMIN_EMAILS.includes((user.email || '').toLowerCase()) && !user.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    user.is_admin = 1;
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });

    req.session.userId = user.id;
    req.session.username = user.username;

    db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

    // Determine redirect: try session first, then state param, then default
    let redirectTo = DEFAULT_REDIRECT;

    const savedRedirect = req.session.appleRedirect;
    delete req.session.appleRedirect;
    if (savedRedirect) {
      try {
        const url = new URL(savedRedirect);
        if (url.hostname === 'wolfeup.com' || url.hostname.endsWith('.wolfeup.com')) {
          redirectTo = savedRedirect;
        }
      } catch (_) { /* invalid URL, use default */ }
    }

    // If session redirect didn't work, try state param backup
    if (redirectTo === DEFAULT_REDIRECT && req._appleStateRedirect) {
      try {
        const url = new URL(req._appleStateRedirect);
        if (url.hostname === 'wolfeup.com' || url.hostname.endsWith('.wolfeup.com')) {
          redirectTo = req._appleStateRedirect;
        }
      } catch (_) { /* invalid URL, use default */ }
    }

    setJwtCookie(res, user);
    res.redirect(redirectTo);
  });
}

router.get('/status', (_req, res) => {
  res.json({
    configured: Boolean(APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_KEY_PATH),
    clientId: APPLE_CLIENT_ID || null,
    teamId: APPLE_TEAM_ID || null,
    keyId: APPLE_KEY_ID || null,
    redirectUri: APPLE_REDIRECT_URI,
    responseMode: APPLE_RESPONSE_MODE,
  });
});

router.get('/', (req, res) => {
  if (!ensureAppleConfigured(res)) return;

  const now = Date.now();
  for (const [k, v] of appleStateStore.entries()) {
    if (now - (v.createdAt || 0) > APPLE_STATE_TTL_MS) appleStateStore.delete(k);
  }

  // Save redirect URL if provided
  const redirectUrl = req.query.redirect || '';
  if (redirectUrl) {
    req.session.appleRedirect = redirectUrl;
  }

  const nonce = crypto.randomBytes(16).toString('hex');

  // Encode redirect in state as JSON payload (backup for session loss)
  const statePayload = {
    csrf: crypto.randomBytes(16).toString('hex'),
  };
  if (redirectUrl) {
    statePayload.redirect = redirectUrl;
  }
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const createdAt = Date.now();
  req.session.appleOAuth = {
    state,
    nonce,
    createdAt,
  };
  appleStateStore.set(state, { nonce, createdAt });

  const params = new URLSearchParams({
    response_type: APPLE_RESPONSE_TYPE,
    response_mode: APPLE_RESPONSE_MODE,
    client_id: APPLE_CLIENT_ID,
    redirect_uri: APPLE_REDIRECT_URI,
    scope: APPLE_SCOPE,
    state,
    nonce,
  });

  // Explicitly save session before redirecting to Apple
  req.session.save((err) => {
    if (err) console.error('[apple] session save error:', err);
    res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
  });
});

router.get('/start', (req, res) => {
  req.url = '/';
  router.handle(req, res);
});

async function handleCallback(req, res) {
  if (!ensureAppleConfigured(res)) return;

  try {
    const db = req.app.locals.db;
    const state = req.body?.state || req.query?.state;
    const code = req.body?.code || req.query?.code;
    let idToken = req.body?.id_token || req.query?.id_token;

    const sessionOAuth = req.session.appleOAuth;
    delete req.session.appleOAuth;

    if (!state) {
      return res.status(400).json({ error: 'Missing Apple auth state' });
    }

    let oauth = null;
    if (sessionOAuth && sessionOAuth.state === state && sessionOAuth.nonce) {
      oauth = sessionOAuth;
    } else {
      const cached = appleStateStore.get(state);
      if (cached && cached.nonce) {
        oauth = { state, nonce: cached.nonce, createdAt: cached.createdAt };
      }
    }

    appleStateStore.delete(state);

    if (!oauth) {
      return res.status(400).json({ error: 'Missing Apple auth state' });
    }
    if (Date.now() - oauth.createdAt > APPLE_STATE_TTL_MS) {
      return res.status(400).json({ error: 'Apple auth request expired' });
    }

    // Extract redirect from state param (backup)
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      if (stateData.redirect) {
        req._appleStateRedirect = stateData.redirect;
      }
    } catch (_) { /* not a JSON state, ignore */ }

    if (!idToken) {
      if (!code) return res.status(400).json({ error: 'Missing Apple authorization code/id_token' });
      idToken = await exchangeCodeForIdToken(code);
    }

    const claims = await verifyAppleIdToken(idToken, oauth.nonce);
    const appleSub = String(claims.sub);
    const email = claims.email ? String(claims.email).toLowerCase() : null;

    let user = db.prepare('SELECT * FROM users WHERE apple_id = ?').get(appleSub);

    if (!user && email) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        db.prepare('UPDATE users SET apple_id = ?, email = ?, display_name = COALESCE(display_name, ?) WHERE id = ?')
          .run(appleSub, email, user.display_name || email.split('@')[0], user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }

    if (!user) {
      const id = uuidv4();
      const resolvedEmail = email || `${appleSub.slice(0, 12)}@apple.local`;
      const displayName = (req.body?.user && (() => {
        try {
          const u = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user;
          const fn = u?.name?.firstName || '';
          const ln = u?.name?.lastName || '';
          return `${fn} ${ln}`.trim() || null;
        } catch (_) {
          return null;
        }
      })()) || resolvedEmail.split('@')[0];

      const username = buildUniqueUsername(db, displayName || resolvedEmail);
      const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
      const isAdmin = (userCount.cnt === 0 || ADMIN_EMAILS.includes(resolvedEmail)) ? 1 : 0;

      db.prepare('INSERT INTO users (id, username, email, display_name, is_admin, apple_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, username, resolvedEmail, displayName, isAdmin, appleSub);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }

    finishLogin(req, res, user);
  } catch (err) {
    console.error('[apple/callback]', err);
    return res.status(400).json({ error: 'Apple authentication failed', detail: err.message });
  }
}

router.get('/callback', handleCallback);
router.post('/callback', handleCallback);

module.exports = router;
