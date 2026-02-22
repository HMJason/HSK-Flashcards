require('dotenv').config();
const express      = require('express');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const path         = require('path');
const fs           = require('fs');
const { OAuth2Client } = require('google-auth-library');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const fb           = require('./firebase');

// ─── Init ─────────────────────────────────────────────────────────────────────
fb.init();
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(compression());           // gzip all responses
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Auth helpers ─────────────────────────────────────────────────────────────
const encodeUser = u  => Buffer.from(JSON.stringify(u)).toString('base64');
const decodeUser = c  => JSON.parse(Buffer.from(c, 'base64').toString('utf8'));

function setUserCookie(res, user) {
  res.cookie('user', encodeUser(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req, res, next) {
  const raw = req.cookies?.user;
  if (!raw) return res.redirect('/login');
  try { req.user = decodeUser(raw); next(); }
  catch { res.clearCookie('user'); res.redirect('/login'); }
}

function requireAuthAPI(req, res, next) {
  const raw = req.cookies?.user;
  if (!raw) return res.status(401).json({ error: 'Unauthorised' });
  try { req.user = decodeUser(raw); next(); }
  catch { res.status(401).json({ error: 'Invalid session' }); }
}

// ─── Mock dev mode ────────────────────────────────────────────────────────────
// Set MOCK_AUTH=true in .env to bypass login entirely (development only)
if (process.env.MOCK_AUTH === 'true') {
  console.log('⚠️  MOCK_AUTH enabled — all requests auto-authenticated as Dev User');
  const MOCK_USER = { id: 'dev-user-001', name: 'Dev User', email: 'dev@local.test', avatar: null, provider: 'mock' };
  app.use((req, res, next) => {
    if (!req.cookies?.user) setUserCookie(res, MOCK_USER);
    next();
  });
}

// ─── Pages ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect(req.cookies?.user ? '/home' : '/login'));
app.get('/home',         requireAuth, (_req, res) => res.sendFile(path.join(__dirname, '../public/landing.html')));
app.get('/conversation', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, '../public/conversation.html')));

app.get('/login', (_req, res) => {
  let html = fs.readFileSync(path.join(__dirname, '../public/login.html'), 'utf8');
  html = html
    .replace('__GOOGLE_CLIENT_ID__', process.env.GOOGLE_CLIENT_ID || '')
    .replace('__APPLE_CLIENT_ID__',  process.env.APPLE_CLIENT_ID  || '');
  res.send(html);
});

app.get('/app',       requireAuth, (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.get('/dashboard', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));

// Static assets — vocab.json gets a long cache (content never changes)
app.use('/app-assets', requireAuth, (req, res, next) => {
  if (req.path.startsWith('/vocab')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
}, express.static(path.join(__dirname, '../public')));

// ─── Google Auth ──────────────────────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  try {
    const ticket = await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({
      idToken: credential, audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p    = ticket.getPayload();
    const user = { id: p.sub, name: p.name, email: p.email, avatar: p.picture, provider: 'google' };
    const { isNewUser } = await fb.upsertUser(user);
    setUserCookie(res, user);
    res.json({ success: true, redirect: '/home', isNewUser });
  } catch (err) {
    console.error('Google auth:', err.message);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// ─── Apple Auth ───────────────────────────────────────────────────────────────
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

app.post('/auth/apple', async (req, res) => {
  const { id_token, user: appleUser } = req.body;
  if (!id_token) return res.status(400).json({ error: 'Missing id_token' });
  try {
    const { payload } = await jwtVerify(id_token, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com', audience: process.env.APPLE_CLIENT_ID,
    });
    let name = 'Apple User';
    try {
      const p = typeof appleUser === 'string' ? JSON.parse(appleUser) : appleUser;
      if (p?.name) name = `${p.name.firstName||''} ${p.name.lastName||''}`.trim();
    } catch {}
    const user = { id: payload.sub, name, email: payload.email||'', avatar: null, provider: 'apple' };
    const { isNewUser } = await fb.upsertUser(user);
    setUserCookie(res, user);
    res.json({ success: true, redirect: '/home', isNewUser });
  } catch (err) {
    console.error('Apple auth:', err.message);
    res.status(401).json({ error: 'Invalid Apple token' });
  }
});

// ─── Auth API ─────────────────────────────────────────────────────────────────
app.get('/auth/me',      requireAuthAPI, (req, res) => res.json(req.user));
app.post('/auth/logout', (req, res) => { res.clearCookie('user'); res.json({ success: true }); });

// ─── Session Tracking ─────────────────────────────────────────────────────────
app.post('/api/session/start', requireAuthAPI, async (req, res) => {
  const sessionId = await fb.startSession(req.user.id, req.body.level ?? 'all');
  res.json({ sessionId });
});

app.post('/api/session/end', requireAuthAPI, async (req, res) => {
  const { sessionId, cardsReviewed, cardsCorrect, durationSeconds, levelBreakdown } = req.body;
  await fb.endSession(sessionId, {
    cardsReviewed:   cardsReviewed   || 0,
    cardsCorrect:    cardsCorrect    || 0,
    durationSeconds: durationSeconds || 0,
    levelBreakdown:  levelBreakdown  || {},
  });
  res.json({ success: true });
});

// ─── Settings API ────────────────────────────────────────────────────────────
app.get('/api/settings', requireAuthAPI, async (req, res) => {
  const settings = await fb.getSettings(req.user.id);
  res.json(settings);
});

app.post('/api/settings', requireAuthAPI, async (req, res) => {
  await fb.saveSettings(req.user.id, req.body);
  const settings = await fb.getSettings(req.user.id);
  res.json({ success: true, settings });
});

app.post('/api/onboarding/complete', requireAuthAPI, async (req, res) => {
  // Save initial settings from onboarding, then mark complete
  if (req.body && Object.keys(req.body).length) {
    await fb.saveSettings(req.user.id, req.body);
  }
  await fb.completeOnboarding(req.user.id);
  res.json({ success: true });
});

// ─── Progress & Metrics API ───────────────────────────────────────────────────
app.get('/api/progress', requireAuthAPI, async (req, res) => {
  const [progress, user, sessions, topLevel] = await Promise.all([
    fb.getProgress(req.user.id),
    fb.getUser(req.user.id),
    fb.getRecentSessions(req.user.id, 14),
    fb.getTopLevel(req.user.id),
  ]);
  res.json({ progress, user, sessions, topLevel });
});

app.post('/api/progress/target', requireAuthAPI, async (req, res) => {
  const target = parseInt(req.body.target);
  if (!target || target < 1) return res.status(400).json({ error: 'Invalid target' });
  await fb.setWeeklyTarget(req.user.id, target);
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`\n  漢 HSK Flashcards → http://localhost:${PORT}\n`));
