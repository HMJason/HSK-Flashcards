# HSK Flashcards — Setup Guide

This guide walks you through everything needed to go from a fresh clone to a fully working app with:

- ✅ Google and Apple Sign-In
- ✅ Supabase database (card progress, sessions, settings synced across devices)
- ✅ GitHub Pages web deployment
- ✅ Native iOS and Android app via Capacitor

---

## Overview

| Layer | Technology |
|---|---|
| Auth | Supabase (Google OAuth + Apple Sign In) |
| Database | Supabase (PostgreSQL with Row Level Security) |
| Web hosting | GitHub Pages (`docs/` folder) |
| Mobile wrapper | Capacitor 5 |
| App ID | `com.hmjason.hskflashcards` |

---

## Part 1 — Supabase Setup

### 1.1 Create a project

1. Go to [supabase.com](https://supabase.com) and sign up / log in
2. Click **New project**
3. Choose a name (e.g. `hsk-flashcards`), set a strong database password, pick a region close to you (EU West for UK)
4. Wait ~2 minutes for provisioning

### 1.2 Run the database schema

1. In your Supabase dashboard, go to **SQL Editor** → **New query**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run** — this creates all tables, indexes, RLS policies, and helper functions

### 1.3 Configure Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google+ API** (or **Google Identity API**)
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Add these **Authorized redirect URIs**:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
   (replace `YOUR_PROJECT_REF` with your Supabase project reference — found in Project Settings → General)
7. Copy the **Client ID** and **Client Secret**
8. In Supabase: **Authentication → Providers → Google**
9. Toggle **Enable Google provider**, paste in the Client ID and Secret, click Save

### 1.4 Configure Apple Sign In

> **Requires**: An Apple Developer account ($99/year)

1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**
2. Create an **App ID**: `com.hmjason.hskflashcards`, enable **Sign In with Apple**
3. Create a **Services ID**: e.g. `com.hmjason.hskflashcards.web`
   - Enable **Sign In with Apple**
   - Add this redirect URL: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Create a **Key** with **Sign In with Apple** capability, download the `.p8` file
5. In Supabase: **Authentication → Providers → Apple**
6. Fill in: Services ID, Team ID, Key ID, and paste the contents of the `.p8` file

### 1.5 Add your credentials to the app

Open `public/supabase-client.js` and replace the two placeholder values:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';  // from Project Settings → API → anon/public
```

Find the anon key at: **Project Settings → API → Project API keys → anon public**

Also update `docs/supabase-client.js` with the same values (or run `node build-static.js` to rebuild).

### 1.6 Set redirect URLs in Supabase

In Supabase: **Authentication → URL Configuration**

Add these to **Redirect URLs**:
```
https://hmjason.github.io/HSK-Flashcards/login.html
http://localhost:3000/login.html
hsk-flashcards://login-callback
```

The third one (`hsk-flashcards://`) is the deep-link scheme for the mobile app.

---

## Part 2 — Web Deployment (GitHub Pages)

The `docs/` folder is already configured as the GitHub Pages source.

### 2.1 Build the static files

```bash
node build-static.js
```

### 2.2 Commit and push

```bash
git add -A
git commit -m "Configure Supabase credentials"
git push origin master
```

GitHub Pages will deploy in ~1 minute to:
- Landing: `https://hmjason.github.io/HSK-Flashcards/`
- Login: `https://hmjason.github.io/HSK-Flashcards/login.html`
- Flashcards: `https://hmjason.github.io/HSK-Flashcards/flashcards.html`

---

## Part 3 — Mobile App (iOS + Android via Capacitor)

### 3.1 Install dependencies

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor/browser @capacitor/app
```

### 3.2 Build the static files first

Capacitor packages the `docs/` folder (the `webDir` in `capacitor.config.json`):

```bash
node build-static.js
```

### 3.3 Add iOS and Android platforms

```bash
npx cap add ios
npx cap add android
```

This creates `ios/` and `android/` folders.

### 3.4 Sync web assets to native projects

Run this every time you rebuild the web app:

```bash
npx cap sync
```

### 3.5 Configure iOS deep links (for OAuth redirect back to app)

Open `ios/App/App/Info.plist` and add this inside the `<dict>`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>hsk-flashcards</string>
    </array>
  </dict>
</array>
```

Also, for **Apple Sign In**, open Xcode (`npx cap open ios`):
1. Select the App target → **Signing & Capabilities**
2. Click **+** → add **Sign In with Apple**

### 3.6 Configure Android deep links

Open `android/app/src/main/AndroidManifest.xml` and add inside the `<activity>` tag:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="hsk-flashcards" android:host="login-callback" />
</intent-filter>
```

### 3.7 Run on device/simulator

```bash
# iOS (requires macOS + Xcode)
npx cap open ios      # Opens in Xcode — run from there

# Android (requires Android Studio)
npx cap open android  # Opens in Android Studio — run from there
```

Or run directly:
```bash
npx cap run ios
npx cap run android
```

### 3.8 Build for app store release

**iOS:**
```bash
npx cap open ios
# In Xcode: Product → Archive → Distribute App
```

**Android:**
```bash
npx cap open android
# In Android Studio: Build → Generate Signed Bundle/APK
```

---

## Part 4 — Development Workflow

### Making changes

1. Edit files in `public/`
2. Run `node build-static.js` to update `docs/`
3. Run `npx cap sync` to push changes to native projects
4. Test in browser at `http://localhost:3000` (with `npm start`) or open in simulator

### Environment variables (server mode only)

Copy `.env.example` to `.env` and fill in values. The static GitHub Pages build doesn't need `.env` — it reads credentials from `supabase-client.js` directly (the anon key is safe to expose in the browser).

---

## Architecture Summary

```
User opens app
    │
    ▼
login.html  ────────────────────────────────────────────┐
    │  (Supabase OAuth)                                  │
    │  → Google/Apple login popup                        │
    │  ← session returned                                │
    ▼                                                    │
index.html (landing)                                     │
    │  Supabase checks session                           │
    │  ✗ Not signed in → redirect to login.html ─────────┘
    │
    ▼
flashcards.html / conversation.html
    │  Supabase session verified on load
    │
    ├── FSRS card states  ──► Supabase card_states table
    ├── Study sessions    ──► Supabase study_sessions table
    └── Settings          ──► Supabase user_settings table
                              (all writes are non-blocking;
                               localStorage stays the source
                               of truth for instant UX)
```

---

## Supabase Database Tables

| Table | Purpose |
|---|---|
| `card_states` | FSRS stability, difficulty, due date per word per user |
| `study_sessions` | Session start/end, cards reviewed, accuracy |
| `user_settings` | Script preference, daily target, voice, speech rate |
| `daily_progress` | Cards completed per day per user |

All tables use **Row Level Security** — users can only read and write their own rows.

---

## Troubleshooting

**Login redirects to a blank page**
→ Check that your Supabase redirect URLs include the exact URL of your login page

**"Supabase not configured" warning on login page**
→ Open `supabase-client.js` and replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY`

**OAuth flow works in browser but not in mobile app**
→ Ensure the `hsk-flashcards://login-callback` deep link is registered in both Info.plist (iOS) and AndroidManifest.xml (Android)

**Apple Sign In not appearing**
→ Apple Sign In only appears on Apple devices (iOS, macOS) in Safari. It is hidden on Android/Chrome by design.

**Card progress not syncing**
→ The app works offline with localStorage. Supabase sync happens in the background when online. Check the browser console for `[sb]` log lines.
