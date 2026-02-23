# 漢 HSK Flashcards

A Mandarin Chinese vocabulary flashcard app covering all 5,000 HSK 1–6 words. Features spaced-repetition recall, Simplified/Traditional toggle, per-card example sentences, text-to-speech, and a Conversational Starters section.

**Live site:** https://hmjason.github.io/HSK-Flashcards/

> **For AI assistants / developers:** The deep technical reference (every function, build step, localStorage schema, known issues) is in **[CLAUDE.md](./CLAUDE.md)**.

---

## Two Deployment Modes

| Mode | How to run | Auth | Persistence |
|------|-----------|------|-------------|
| **GitHub Pages (static)** | `node build-static.js` → push | None — no login needed | `localStorage` |
| **Server** | `npm start` | Google / Apple OAuth | Firebase Firestore |

The static version is live at the URL above — no setup needed to use it.

---

## Quick Start (Server Mode)

```bash
npm install
cp .env.example .env   # fill in credentials — see below
npm start              # → http://localhost:3000
```

For local development without real OAuth, set `MOCK_AUTH=true` in `.env`. This auto-authenticates every request as a dev user and bypasses the login page entirely.

---

## Project Structure

```
HSK-Flashcards/
├── public/                    # Source pages — always edit here, never in docs/
│   ├── index.html             # Flashcard app (core page)
│   ├── landing.html           # Home / navigation page
│   ├── conversation.html      # Conversational starters page
│   ├── dashboard.html         # Progress analytics (server mode only)
│   ├── login.html             # OAuth login page (server mode only)
│   ├── vocab-hsk1.json        # 150 words  — HSK 1
│   ├── vocab-hsk2.json        # 150 words  — HSK 2
│   ├── vocab-hsk3.json        # 299 words  — HSK 3
│   ├── vocab-hsk4.json        # 601 words  — HSK 4
│   ├── vocab-hsk5.json        # 1,300 words — HSK 5
│   ├── vocab-hsk6.json        # 2,500 words — HSK 6
│   ├── vocab.json             # All 5,000 words combined
│   └── examples-hsk1.json    # Example sentences for HSK 1 (150 entries)
│
├── server/
│   ├── index.js               # Express server, all routes, OAuth
│   └── firebase.js            # Firestore CRUD helpers
│
├── docs/                      # Static build output — served by GitHub Pages
│   ├── index.html             # Built from landing.html
│   ├── flashcards.html        # Built from public/index.html
│   ├── conversation.html      # Built from public/conversation.html
│   ├── .nojekyll              # Disables Jekyll on GitHub Pages
│   └── vocab-*.json           # Copied from public/
│
├── build-static.js            # Build script — run after every change to public/
├── CLAUDE.md                  # Deep technical reference for developers / AI
├── .env                       # Secrets — never commit
├── firebase.json
├── firestore.rules
└── package.json
```

---

## Static Build Workflow

**Never edit `docs/` directly. Always edit `public/` then rebuild.**

```bash
node build-static.js
git add -A
git commit -m "describe your change"
git push origin master
```

GitHub Pages deploys from `docs/` on `master`. Live in ~60 seconds. Test in an incognito window to bypass browser cache.

The build script converts server-side HTML into a static version by replacing API calls with `localStorage` equivalents, rewriting asset URLs, and inlining HSK 1 + 2 vocabulary for zero-latency first card load. See [CLAUDE.md](./CLAUDE.md) for a full step-by-step breakdown.

---

## Features

### Flashcard App
- 5,000 words across HSK 1–6, shuffled each session
- Reveal mechanic — Chinese + pinyin shown first; tap to reveal meaning
- Example sentences on reveal (HSK 1 — Chinese, pinyin, English)
- Character breakdown tiles for multi-character words
- Simplified / Traditional toggle — switches instantly mid-session
- SRS recall buttons: **Again** (re-queues 5–10 cards ahead) / **Good** / **Perfect**
- Text-to-speech — speaks the word (`zh-CN`) or reads pinyin (`en-US`)
- Auto-play audio on reveal — configurable in settings
- Daily progress bar with confetti on completion
- Streak counter — consecutive days studied
- Lazy loading — active level loads first; other levels stream in the background

### Conversational Starters
- 20 phrases across 5 categories: Greetings, Introductions, Politeness, Learning, Practical
- Same reveal mechanic as flashcards
- Cultural usage tips
- Category filter bar and "Speak all phrases" auto-play

---

## Vocabulary Data Format

Sourced from [`clem109/hsk-vocabulary`](https://github.com/clem109/hsk-vocabulary) (MIT Licence).

```json
{ "s": "爱", "t": "愛", "p": "ài", "m": "to love; affection", "h": 1 }
```

`s` = simplified · `t` = traditional · `p` = pinyin · `m` = meaning · `h` = HSK level

## Example Sentences Format

`examples-hsk1.json` — flat object keyed by simplified character:

```json
{ "爱": { "zh": "我爱我的家人。", "py": "Wǒ ài wǒ de jiārén.", "en": "I love my family." } }
```

Currently only HSK 1 has example sentences. To add more levels, create `public/examples-hsk{N}.json` and add the filename to the copy list in `build-static.js`.

---

## Server Mode Setup

### Environment Variables

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

APPLE_CLIENT_ID=com.yourcompany.hsk-flashcards
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

FIREBASE_PROJECT_ID=hsk-flashcards-bd0dc
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@hsk-flashcards-bd0dc.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

PORT=3000
SESSION_SECRET=some-random-secret
MOCK_AUTH=true    # bypass login for local dev
```

### Google Sign In
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client ID (Web application)
2. Add `http://localhost:3000` to Authorised JavaScript origins
3. Copy Client ID → `GOOGLE_CLIENT_ID`

### Apple Sign In
1. [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers) → Create Services ID, enable Sign in with Apple
2. Add `http://localhost:3000` as Return URL
3. Create a Sign in with Apple key, download `.p8` file
4. Fill in `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`

### Firebase
1. Create project at [console.firebase.google.com](https://console.firebase.google.com), enable Firestore (Native mode)
2. Project Settings → Service Accounts → Generate new private key
3. Copy `project_id`, `client_email`, `private_key` to `.env`

### Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase use hsk-flashcards-bd0dc
npm run deploy:rules     # firestore.rules
npm run deploy:indexes   # firestore.indexes.json
```

### Firestore Security Model

All DB access goes through the server via Firebase Admin SDK (bypasses rules). Rules are a safety net against any direct client access:

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | Owner only | Server only |
| `sessions/{sessionId}` | Owner only | Server only |
| `progress/{uid}` | Owner only | Server only |
| `settings/{uid}` | Owner only | Owner (allowed fields only) |
| Everything else | ❌ Denied | ❌ Denied |

---

## Security Reminders

- Never commit `.env` — it's in `.gitignore` but verify before pushing
- Rotate the service account key if it's ever been shared or exposed
- Enable App Check in Firebase Console for additional production protection
