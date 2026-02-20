'use strict';

const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || '';
const AUTH_SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const JWT_EXPIRY_SECS = AUTH_SESSION_DAYS * 24 * 60 * 60;

function setJwtCookie(res, user) {
  const token = jwt.sign(
    { userId: user.id, email: user.email, username: user.username, isAdmin: !!(user.is_admin) },
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
}

const ADMIN_EMAIL = 'twolfekc@gmail.com';
const ADMIN_EMAILS = ['twolfekc@gmail.com', 'wolfeupkc@gmail.com'];
const DEFAULT_REDIRECT = 'https://mission.wolfeup.com';

function initGoogleOAuth(app) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'https://auth.wolfeup.com/auth/google/callback';

  if (!clientID || !clientSecret) {
    console.log('[google-oauth] GOOGLE_CLIENT_ID/SECRET not set — running in stub mode');
    return;
  }

  passport.use('google', new GoogleStrategy(
    { clientID, clientSecret, callbackURL },
    (accessToken, refreshToken, profile, done) => {
      done(null, profile);
    }
  ));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));

  app.use(passport.initialize());
  console.log('[google-oauth] Strategy registered');
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/google — redirect to Google
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    return res.status(503).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Google OAuth Not Configured — WolfeUp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#e2e8f0;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#161b27;border:1px solid #2a3347;border-radius:12px;padding:40px;
          max-width:520px;width:100%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.5)}
    .icon{font-size:52px;margin-bottom:20px}
    h1{font-size:22px;font-weight:700;margin-bottom:12px;color:#f87171}
    p{font-size:14px;color:#94a3b8;line-height:1.7;margin-bottom:16px}
    code{background:#1e2636;border:1px solid #2a3347;border-radius:6px;padding:2px 8px;
         font-size:13px;color:#a5b4fc}
    .steps{text-align:left;margin:20px 0;background:#1e2636;border-radius:8px;padding:20px}
    .steps ol{padding-left:20px}
    .steps li{font-size:13px;color:#94a3b8;margin-bottom:8px;line-height:1.6}
    .steps li strong{color:#e2e8f0}
    .back{display:inline-block;margin-top:24px;padding:10px 24px;background:#6366f1;
          color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;
          transition:background .15s}
    .back:hover{background:#818cf8}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Google OAuth Not Configured</h1>
    <p>The auth service is running in stub mode.<br/>
       Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>
       in the auth service environment to enable Google sign-in.</p>

    <div class="steps">
      <p style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:12px">
        How to activate Google OAuth:
      </p>
      <ol>
        <li>Go to <strong>console.cloud.google.com</strong></li>
        <li>Create or select a project</li>
        <li>Navigate to <strong>APIs &amp; Services → Credentials</strong></li>
        <li>Click <strong>Create Credentials → OAuth 2.0 Client ID</strong></li>
        <li>Application type: <strong>Web application</strong></li>
        <li>Add authorized redirect URI:<br/>
            <code>https://auth.wolfeup.com/auth/google/callback</code></li>
        <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong></li>
        <li>Add to <code>/opt/auth-service/.env</code>:<br/>
            <code>GOOGLE_CLIENT_ID=your-client-id</code><br/>
            <code>GOOGLE_CLIENT_SECRET=your-client-secret</code></li>
        <li>Rebuild the Docker image and restart the container</li>
      </ol>
    </div>

    <a href="/" class="back">← Back to Sign In</a>
  </div>
</body>
</html>`);
  }

  // Save the redirect target so we can use it after callback
  const redirectUrl = req.query.redirect || '';

  if (redirectUrl) {
    req.session.googleRedirect = redirectUrl;
  }

  // Encode redirect in state param as backup (survives even if session is lost)
  const statePayload = redirectUrl
    ? Buffer.from(JSON.stringify({ redirect: redirectUrl })).toString('base64url')
    : '';

  // Explicitly save session before redirecting to Google
  req.session.save((err) => {
    if (err) console.error('[google] session save error:', err);

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      state: statePayload || undefined,
    })(req, res, next);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/google/callback — handle Google response
// ─────────────────────────────────────────────────────────────────────────────
router.get('/callback', (req, res, next) => {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    return res.redirect('/?error=google_not_configured');
  }

  passport.authenticate('google', { session: false, failureRedirect: '/?error=google_auth_failed' },
    (err, profile) => {
      if (err || !profile) {
        console.error('[google/callback] auth error:', err);
        return res.redirect('/?error=google_auth_failed');
      }

      const db = req.app.locals.db;
      const googleId = profile.id;
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value || '').toLowerCase();
      const displayName = profile.displayName || email.split('@')[0];
      const avatarUrl = profile.photos && profile.photos[0] && profile.photos[0].value || null;

      if (!email) {
        console.error('[google/callback] No email in Google profile');
        return res.redirect('/?error=google_no_email');
      }

      try {
        let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (user) {
          if (!user.google_id) {
            db.prepare('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?')
              .run(googleId, avatarUrl, user.id);
          } else {
            db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
              .run(avatarUrl, user.id);
          }
        } else {
          const newId = uuidv4();
          let baseUsername = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 28) || 'user';

          let username = baseUsername;
          let attempts = 0;
          while (true) {
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (!existing) break;
            username = `${baseUsername}_${Math.floor(Math.random() * 9000 + 1000)}`;
            if (++attempts > 10) { username = `${baseUsername}_${Date.now().toString(36)}`; break; }
          }

          const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
          const isAdmin = (userCount.cnt === 0 || ADMIN_EMAILS.includes(email)) ? 1 : 0;

          db.prepare(
            'INSERT INTO users (id, username, email, display_name, google_id, avatar_url, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(newId, username, email, displayName, googleId, avatarUrl, isAdmin);

          user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId);
        }

        if (ADMIN_EMAILS.includes(email) && !user.is_admin) {
          db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
        }

        db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

        req.session.regenerate((err) => {
          if (err) {
            console.error('[google/callback] session regen error:', err);
            return res.redirect('/?error=session_error');
          }

          req.session.userId = user.id;
          req.session.username = user.username;

          // Determine redirect: try session first, then state param, then default
          let redirectTo = DEFAULT_REDIRECT;

          // Try session-saved redirect
          const savedRedirect = req.session.googleRedirect;
          delete req.session.googleRedirect;
          if (savedRedirect) {
            try {
              const url = new URL(savedRedirect);
              if (url.hostname === 'wolfeup.com' || url.hostname.endsWith('.wolfeup.com')) {
                redirectTo = savedRedirect;
              }
            } catch (_) { /* invalid URL, use default */ }
          }

          // If session redirect didn't work, try state param backup
          if (redirectTo === DEFAULT_REDIRECT && req.query.state) {
            try {
              const stateData = JSON.parse(Buffer.from(req.query.state, 'base64url').toString());
              if (stateData.redirect) {
                const url = new URL(stateData.redirect);
                if (url.hostname === 'wolfeup.com' || url.hostname.endsWith('.wolfeup.com')) {
                  redirectTo = stateData.redirect;
                }
              }
            } catch (_) { /* invalid state, use default */ }
          }

          req.session.save(() => {
            setJwtCookie(res, user);
            res.redirect(redirectTo);
          });
        });

      } catch (dbErr) {
        console.error('[google/callback] DB error:', dbErr);
        res.redirect('/?error=db_error');
      }
    }
  )(req, res, next);
});

module.exports = { router, initGoogleOAuth };
