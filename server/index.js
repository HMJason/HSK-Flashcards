require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const user = req.cookies?.user;
  if (!user) return res.redirect('/login');
  try {
    req.user = JSON.parse(Buffer.from(user, 'base64').toString('utf8'));
    next();
  } catch {
    res.clearCookie('user');
    res.redirect('/login');
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login page (public)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Root → redirect to app if logged in, else login
app.get('/', (req, res) => {
  const user = req.cookies?.user;
  if (user) return res.redirect('/app');
  res.redirect('/login');
});

// Protected app
app.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve static assets (vocab.json, etc.) — only for authenticated users
app.use('/app-assets', requireAuth, express.static(path.join(__dirname, '../public')));

// ─── Google Auth ──────────────────────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      avatar: payload.picture,
      provider: 'google',
    };

    const encoded = Buffer.from(JSON.stringify(user)).toString('base64');
    res.cookie('user', encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.json({ success: true, redirect: '/app' });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// ─── Apple Auth ───────────────────────────────────────────────────────────────
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

app.post('/auth/apple', async (req, res) => {
  const { id_token, user: appleUser } = req.body;
  if (!id_token) return res.status(400).json({ error: 'Missing id_token' });

  try {
    const { payload } = await jwtVerify(id_token, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: process.env.APPLE_CLIENT_ID,
    });

    // Apple only sends name on first sign-in; cache it if provided
    let name = 'Apple User';
    if (appleUser) {
      try {
        const parsed = typeof appleUser === 'string' ? JSON.parse(appleUser) : appleUser;
        if (parsed?.name) {
          name = `${parsed.name.firstName || ''} ${parsed.name.lastName || ''}`.trim();
        }
      } catch {}
    }

    const user = {
      id: payload.sub,
      name,
      email: payload.email || 'hidden@privaterelay.appleid.com',
      avatar: null,
      provider: 'apple',
    };

    const encoded = Buffer.from(JSON.stringify(user)).toString('base64');
    res.cookie('user', encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, redirect: '/app' });
  } catch (err) {
    console.error('Apple auth error:', err.message);
    res.status(401).json({ error: 'Invalid Apple token' });
  }
});

// ─── Current User ─────────────────────────────────────────────────────────────
app.get('/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ─── Logout ───────────────────────────────────────────────────────────────────
app.post('/auth/logout', (req, res) => {
  res.clearCookie('user');
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  漢 HSK Flashcards running at http://localhost:${PORT}\n`);
});
