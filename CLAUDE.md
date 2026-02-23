# HSK Flashcards — Developer Documentation

This document is the authoritative reference for the HSK Flashcards codebase. It is written for AI assistants continuing development, and covers architecture, every file, every key function, past decisions, active bugs fixed, and known next steps.

---

## 1. What This App Is

A Mandarin Chinese vocabulary flashcard app covering all 5,000 HSK 1–6 words. It has two deployment targets that share the same source files:

- **Server version** (`npm start`): Express.js + Google/Apple OAuth + Firebase Firestore for user accounts and progress tracking. Runs locally or on a VPS.
- **Static version** (GitHub Pages): No server, no login. Uses `localStorage` for all persistence. Lives in `docs/` and is built by running `node build-static.js`.

**Live URL:** https://hmjason.github.io/HSK-Flashcards/  
**GitHub repo:** https://github.com/HMJason/HSK-Flashcards  
**Local dev:** `npm start` (with `MOCK_AUTH=true` in `.env` to skip login)

---

## 2. Repository Layout

```
HSK-Flashcards/
├── public/                   # Source HTML pages (served by Express)
│   ├── index.html            # ← FLASHCARD APP (the core page)
│   ├── landing.html          # Home/navigation page
│   ├── conversation.html     # Conversation starters page
│   ├── dashboard.html        # Progress analytics (server-only)
│   ├── login.html            # OAuth login page (server-only)
│   ├── vocab.json            # All 5,000 words combined
│   ├── vocab-hsk1.json       # 150 words  (HSK 1)
│   ├── vocab-hsk2.json       # 150 words  (HSK 2)
│   ├── vocab-hsk3.json       # 299 words  (HSK 3)
│   ├── vocab-hsk4.json       # 601 words  (HSK 4)
│   ├── vocab-hsk5.json       # 1,300 words (HSK 5)
│   ├── vocab-hsk6.json       # 2,500 words (HSK 6)
│   └── examples-hsk1.json   # 150 example sentences for HSK 1
│
├── server/
│   ├── index.js              # Express server, all routes, OAuth
│   └── firebase.js           # Firestore wrapper (CRUD helpers)
│
├── docs/                     # ← STATIC BUILD OUTPUT (GitHub Pages serves this)
│   ├── index.html            # Built from landing.html
│   ├── flashcards.html       # Built from public/index.html
│   ├── conversation.html     # Built from public/conversation.html
│   ├── .nojekyll             # Tells GitHub Pages not to use Jekyll
│   └── vocab-*.json          # Copied from public/
│   └── examples-hsk1.json   # Copied from public/
│
├── build-static.js           # ← BUILD SCRIPT. Run this after any change to public/
├── package.json
├── .env                      # Secrets (never committed)
├── firebase.json
├── firestore.rules
└── CLAUDE.md                 # This file
```

**Critical rule:** `docs/` is never edited by hand. Always edit `public/` source files and then run `node build-static.js` to regenerate `docs/`.

---

## 3. Vocab Data Format

Each word object looks like:

```json
{ "s": "爱", "t": "愛", "p": "ài", "m": "to love; affection", "h": 1 }
```

| Field | Meaning |
|-------|---------|
| `s` | Simplified Chinese character(s) |
| `t` | Traditional Chinese character(s) |
| `p` | Pinyin with tone marks |
| `m` | English meaning(s), semicolon-separated |
| `h` | HSK level (1–6) |

Source: [`clem109/hsk-vocabulary`](https://github.com/clem109/hsk-vocabulary) (MIT licence).

## 4. Example Sentences Format

`examples-hsk1.json` is a flat object keyed by the simplified character `s`:

```json
{
  "爱": { "zh": "我爱我的家人。", "py": "Wǒ ài wǒ de jiārén.", "en": "I love my family." },
  "八": { "zh": "我有八本书。",   "py": "Wǒ yǒu bā běn shū.",  "en": "I have eight books." }
}
```

Only HSK 1 has example sentences right now (`examples-hsk1.json`). Files for levels 2–6 (`examples-hsk2.json` … `examples-hsk6.json`) do not exist yet. When they are created in `public/`, they must also be added to the copy list in `build-static.js`.

---

## 5. The Build Script (`build-static.js`)

This is the most important file for ongoing development. Run it after every change:

```bash
node build-static.js
```

It works by reading the server-side HTML source files from `public/` and applying a series of targeted string replacements to make them work without a server. The replacements are strict exact-match (not regex), so if server source code changes, the old pattern strings in `build-static.js` must be updated to match.

### What it does step by step

1. **Copies** `vocab*.json` and `examples-hsk1.json` from `public/` → `docs/`
2. **Fixes links** — `/home` → `index.html`, `/dashboard` → `#`
3. **Rewrites URLs** — `/app-assets/vocab-hsk${level}.json` → `vocab-hsk${level}.json`
4. **Inlines HSK 1 + 2 vocab** and **HSK 1 examples** directly into `flashcards.html` as JavaScript so the first card appears with zero network latency
5. **Replaces `loadUser()`** — removes the `fetch('/auth/me')` version; substitutes a localStorage-only version that reads `hsk_settings` and `hsk_progress`, sets defaults, updates the daily bar and streak display
6. **Replaces `saveSettings()`** — removes the `fetch('/api/settings', …)` call; substitutes a synchronous localStorage write
7. **Replaces `logout()`** — removes `fetch('/auth/logout')`; substitutes `localStorage.clear(); location.reload()`
8. **Stubs out `startSession()` / `endSession()`** — adds `return;` as the first line so they are no-ops (no server endpoints to call)
9. **Removes `beforeunload` sendBeacon** — replaces it with a comment
10. **Injects `calcStreak()`** — this function exists only in the static build (not needed server-side)
11. **Fixes the error message** — removes the "make sure the server is running" text
12. **Runs JS syntax check** on output files via `node --check`

### Adding a new server API call

If you add a new `fetch('/api/...')` call to any `public/` page, you must also add a replacement step in `build-static.js` that either stubs it out or replaces it with a `localStorage` equivalent. The syntax check at the end will catch parse errors but not missing replacements.

---

## 6. The Flashcard App (`public/index.html`)

This is the largest and most important file (~1,350 lines). Everything is in one file: HTML, CSS, and JavaScript.

### State variables (top of `<script>`)

```js
let allVocab = [];          // current level's full word list
let script = 'simplified';  // or 'traditional'
let currentLevel = 1;       // 1-6 or 'all'
let queue = [];             // cards remaining this session (may re-insert 'again' cards)
let doneCount = 0;          // cards marked good/perfect this session
let reviewCount = 0;        // cards re-queued via 'again'
let reviewed = 0;           // total cards seen this session
let cardsCorrect = 0;       // good + perfect count
let currentCard = null;     // the word object at queue[0]

let dailyTarget = 20;       // from settings
let dailyDone = 0;          // good/perfect cards today (persisted in hsk_progress)
let targetNotified = false; // prevents toast firing twice

const vocabCache = {};      // level → word array (1-6 or 'all')
const examplesCache = {};   // simplified char → {zh, py, en}
                            // also uses sentinel keys '_loaded1' … '_loaded6'

let currentSettings = {};
let pendingSettings = {};   // holds unsaved changes while settings panel is open
```

### Key functions

#### `loadVocab()`
Fetches the active level's words, starts `initQueue()`, then silently background-fetches remaining levels if `currentLevel === 'all'`. Also calls `fetchExamples(firstLevel)` to preload example sentences.

#### `fetchLevel(level)`
Returns words from `vocabCache` if already loaded, otherwise fetches from `vocab-hsk{level}.json`. Also merges into `vocabCache['all']` so that 'all' mode accumulates progressively.

#### `fetchExamples(level)`
Fetches `examples-hsk{level}.json` and merges into `examplesCache` using `Object.assign`. Uses `_loaded{level}` sentinel keys to avoid re-fetching. In the static build, HSK 1 is already pre-seeded so no network request is needed for it.

#### `initQueue()`
Shuffles `allVocab` randomly into `queue`, resets session counters, calls `startSession()` (no-op in static), then `showNext()`.

#### `showNext()`
Takes `queue[0]` as `currentCard` and calls `renderCard()`. If queue is empty, calls `showDone()`.

#### `cardHTML(card, revealed)`
Pure function — returns an HTML string for the card. If `revealed === false`, shows only the Chinese + pinyin + reveal button. If `revealed === true`, shows the full answer: meaning, example sentence (if `examplesCache[card.s]` exists), speak buttons, character breakdown grid, and recall buttons.

**Why a pure function?** Previously the code used `display:none` toggling on a hidden `#cardAnswer` div, but CSS animations and z-index issues made the reveal unreliable. Now `revealCard()` simply calls `cardHTML(currentCard, true)` and replaces `innerHTML` entirely.

#### `renderCard(card)`
`document.getElementById('cardContainer').innerHTML = cardHTML(card, false);`

#### `revealCard()`
```js
function revealCard() {
  if (!currentCard) return;
  document.getElementById('cardContainer').innerHTML = cardHTML(currentCard, true);
  if (currentSettings.autoPlayAudio !== false) speakWord();
}
```
Called by `onclick="revealCard()"` on the reveal button. Re-renders the card in revealed state.

#### `recall(type)`
`type` is `'again'`, `'good'`, or `'perfect'`.
- `'again'` → re-inserts the card at a random position 5–10 steps ahead in the queue, increments `reviewCount`
- `'good'` / `'perfect'` → increments `doneCount`, `cardsCorrect`, `dailyDone`, updates daily bar
- Then calls `updateStats()` and `showNext()`

#### `speakWord()` / `speakPinyin()`
Uses the Web Speech API (`window.speechSynthesis`). `speakWord()` reads the Chinese character at `zh-CN` lang, rate 0.8. `speakPinyin()` reads the pinyin string at `en-US` lang, rate 0.75 (English TTS reads pinyin reasonably well).

#### `applySettings(s)`
Called on load and after saving settings. Sets `dailyTarget`, updates script toggle buttons, updates the default level button, and syncs all settings panel controls to match `s`.

#### `setLevel(l, btn)` / `setScript(s, btn)`
Called by the level/script buttons. `setLevel` uses `vocabCache` if already loaded, otherwise shows a spinner and calls `fetchLevel`. Both call `fetchExamples` for the new level.

### Settings stored in localStorage (`hsk_settings`)

```js
{
  dailyTarget: 20,          // number 5-100
  soundEnabled: true,       // not currently wired to mute (UI exists, logic pending)
  autoPlayAudio: true,      // speak word automatically on reveal
  trackingEnabled: false,   // not used in static build
  preferredScript: 'simplified', // or 'traditional'
  defaultLevel: 1           // 1-6 or 'all'
}
```

### Progress stored in localStorage (`hsk_progress`)

```js
{
  lastStudyDate: '2026-02-23',  // ISO date string
  dailyCards: 14,               // cards completed on lastStudyDate
  streak: 3                     // consecutive days studied
}
```

`calcStreak(prog)` (static build only): returns 0 if `lastStudyDate` is more than 1 day ago, else returns `prog.streak`.

---

## 7. The Landing Page (`public/landing.html`)

Simple navigation hub. Two large buttons: **Flashcards** (`/app`) and **Conversational Starters** (`/conversation`). In the static build, these become `flashcards.html` and `conversation.html`.

---

## 8. Conversation Starters (`public/conversation.html`)

A separate page with 20 easy Mandarin phrases organised into 5 categories: Greetings, Introductions, Politeness, Learning, Practical.

Each phrase card shows:
- Chinese characters
- Pinyin
- English translation
- Usage tip / cultural note

Features: category filter bar, "Speak all phrases" button, per-card speak buttons (Chinese TTS + Pinyin TTS), reveal mechanic (same as flashcards — shows Chinese/pinyin first, tap to see English + tip), auto-play toggle.

---

## 9. Server (`server/index.js`)

Express app. All routes require authentication via the `requireAuth` / `requireAuthAPI` middleware, which reads the `user` cookie (a base64-encoded JSON user object).

### Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Redirect → `/home` or `/login` |
| GET | `/home` | Serve `landing.html` |
| GET | `/app` | Serve `index.html` (flashcard app) |
| GET | `/conversation` | Serve `conversation.html` |
| GET | `/dashboard` | Serve `dashboard.html` |
| GET | `/login` | Serve `login.html` (injects OAuth client IDs) |
| POST | `/auth/google` | Verify Google ID token, set cookie, upsert Firestore user |
| POST | `/auth/apple` | Verify Apple JWT, set cookie, upsert Firestore user |
| GET | `/auth/me` | Return current user from cookie |
| POST | `/auth/logout` | Clear cookie |
| POST | `/api/session/start` | Create Firestore session doc, return `sessionId` |
| POST | `/api/session/end` | Update session doc with results |
| GET | `/api/settings` | Get user settings from Firestore |
| POST | `/api/settings` | Save user settings to Firestore |
| POST | `/api/onboarding/complete` | Mark onboarding done in Firestore |
| GET | `/api/progress` | Get stats for dashboard (sessions, streak, top level) |
| POST | `/api/progress/target` | Update weekly target |
| GET | `/app-assets/*` | Serve `public/` files (vocab JSON etc.), with long cache headers for vocab |

### Auth — MOCK_AUTH mode

Set `MOCK_AUTH=true` in `.env` to auto-authenticate every request as a hardcoded dev user (`dev@local.test`). This completely bypasses Google/Apple OAuth and is the recommended local development setup.

---

## 10. Firebase (`server/firebase.js`)

Wraps the Firebase Admin SDK. All reads/writes go through this file. Key functions:

- `upsertUser(user)` — creates or updates user doc in `users/{id}`, returns `{ isNewUser }`
- `getUser(id)` — fetches user doc
- `getSettings(id)` — fetches `users/{id}/settings/prefs`, returns defaults if not found
- `saveSettings(id, settings)` — merges settings into `users/{id}/settings/prefs`
- `startSession(userId, level)` — creates a session doc in `sessions/`, returns doc ID
- `endSession(sessionId, data)` — updates session doc with review stats
- `getRecentSessions(userId, days)` — fetches last N days of sessions
- `completeOnboarding(userId)` — sets `onboardingComplete: true` on user doc
- `getProgress(userId)` — aggregate stats (streak, total cards, etc.)
- `getTopLevel(userId)` — highest HSK level the user has studied

Firestore credentials come from `.env` (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).

---

## 11. Design System

The app uses a consistent Japanese/Chinese editorial aesthetic throughout. All CSS variables are defined in the `<style>` block at the top of each page.

### Colour palette

```css
--cream:    #f5f0e8   /* page background */
--card-bg:  #faf7f2   /* card background */
--ink:      #1a1208   /* primary text */
--ink-light:#3d2b1f   /* secondary text */
--ink-muted:#7a6a5a   /* hints, labels */
--border:   #d4c9b8   /* dividers */
--gold:     #8b6914   /* accent — pinyin, highlights */
--red:      #8b1a1a   /* pinyin text colour */
--green:    #2d7a4f   /* success / completion states */
```

### Typography

- **EB Garamond** (Google Fonts) — UI text, buttons, body
- **Noto Serif SC** (Google Fonts) — Chinese characters
- **Playfair Display** (Google Fonts) — pinyin (italic)

### Card layout

Cards use `flexbox` with `justify-content: space-between`, `min-height: 340px`, `padding: 60px 56px`. The Chinese character is `80px`, pinyin `32px`. Mobile breakpoint at 480px reduces these.

### Card reveal pattern

The reveal mechanic re-renders the entire card (not `display:none` toggling) because toggling caused CSS animation conflicts that made the button appear to do nothing. Pattern:

1. `renderCard(card)` → `cardHTML(card, false)` — shows Chinese + pinyin + reveal button
2. User taps reveal → `revealCard()` → `cardHTML(currentCard, true)` → replaces innerHTML → auto-plays audio

---

## 12. localStorage Keys (Static Build)

| Key | Contents |
|-----|----------|
| `hsk_settings` | Settings object (see Section 6) |
| `hsk_user` | `{ name: "Jason" }` — only used by landing page avatar |
| `hsk_progress` | `{ lastStudyDate, dailyCards, streak }` |

---

## 13. Known Issues and Things to Watch Out For

### The build script uses exact-match string replacement

`build-static.js` uses `str.split(from).join(to)` — not regex. If you refactor or reformat any of the replaced function bodies in `public/index.html`, you must update the corresponding `from` string in `build-static.js` or the build will warn `⚠️ Pattern not found` and leave the server-side code intact (which will 404 on GitHub Pages).

### Example sentences only exist for HSK 1

`examplesCache` is seeded with HSK 1 data inline in the static build. When a user switches to HSK 2–6, example sentences are silently absent (the example block just doesn't render). To add examples for other levels:
1. Create `public/examples-hsk{N}.json` with the same format as `examples-hsk1.json`
2. Add the filename to the copy list in `build-static.js` (line 17–20)
3. Optionally inline the data in the build script alongside HSK 1

### `soundEnabled` setting exists but isn't fully wired

The settings panel has a "Sound" toggle that saves to `soundEnabled` in localStorage, but the app doesn't currently check this flag to mute anything. `autoPlayAudio` (auto-play on reveal) IS wired and works correctly.

### Dashboard page is server-only

`public/dashboard.html` exists and works when running the server with Firebase. In the static build, all "My Stats" links point to `#` (a no-op). The dashboard page was not ported to the static build.

### Progress bar resets on every page load in static build

`applySettings()` calls `dailyDone = 0` before re-reading from localStorage, then `loadUser()` restores the count from `hsk_progress`. The order is correct, but if `applySettings` is called again later (e.g., after saving settings), `dailyDone` gets reset to 0 again. This is a minor bug.

---

## 14. How to Add a New Feature

### Adding a new page

1. Create `public/newpage.html` with the same header/nav structure
2. Add a route in `server/index.js`
3. Add a build step in `build-static.js` to copy and transform it
4. Add the link to `landing.html`

### Adding a new setting

1. Add the control to the settings panel HTML in `public/index.html`
2. Read it in `saveSettings()` and write to `currentSettings`
3. Apply it in `applySettings()`
4. In `build-static.js`, the `saveSettings()` replacement needs to read the new field too

### Adding example sentences for HSK 2–6

1. Create `public/examples-hsk2.json` (same format as HSK 1)
2. In `build-static.js`, add to the copy list and optionally inline it (like HSK 1)
3. The `fetchExamples()` function already handles levels 2–6 via lazy fetch — no changes needed there

---

## 15. Deployment

### GitHub Pages (static)

```bash
node build-static.js
git add -A
git commit -m "description"
git push origin master
```

GitHub Pages serves the `docs/` folder from the `master` branch. Deployments take ~60 seconds. The CDN can cache aggressively — test in an incognito window to bypass browser cache.

### Local server

```bash
# .env needs MOCK_AUTH=true (or real OAuth credentials)
npm start
# → http://localhost:3000
```

---

## 16. Git History Summary

Key commits in reverse chronological order:

| Commit | What changed |
|--------|-------------|
| `9a517be` | Add example sentences to flashcard reveal (HSK 1, 150 sentences embedded inline) |
| `6f592c5` | Remove onboarding modal entirely — page goes straight to cards on load |
| `24dbe46` | Fix reveal button — onboarding overlay was intercepting all card clicks |
| `d782890` | Rewrite reveal: re-render card instead of toggling display:none |
| `c4a9dea` | Fix JS crash: define missing `calcStreak()`, remove sendBeacon |
| `72ed959` | Embed HSK1+2 vocab inline for zero-latency first card |
| `c476435` | Add name input to onboarding, replace server API with localStorage |
| `5cbcd7f` | Fix static build: reveal mechanic and correct vocab URLs |

---

## 17. Environment Variables (`.env`)

```
GOOGLE_CLIENT_ID=          # Google OAuth client ID
APPLE_CLIENT_ID=           # Apple Sign In service ID
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=         # Multi-line PEM, escaped as \n

FIREBASE_PROJECT_ID=hsk-flashcards-bd0dc
FIREBASE_CLIENT_EMAIL=     # Service account email
FIREBASE_PRIVATE_KEY=      # Service account private key PEM

PORT=3000
SESSION_SECRET=
MOCK_AUTH=true             # Set to bypass login in local dev
```
