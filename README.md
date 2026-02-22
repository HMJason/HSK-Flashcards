# 漢 HSK Flashcards

A Mandarin Chinese flashcard app with all 5,000 HSK vocabulary words (HSK 1–6), Simplified/Traditional toggle, SRS recall system, and Google/Apple authentication.

## Quick Start

```bash
npm install
cp .env.example .env   # Fill in your credentials
npm start              # http://localhost:3000
```

For development with auto-reload:
```bash
npm run dev
```

## Setting Up Authentication

### Google Sign In
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:3000` to **Authorised JavaScript origins**
4. Copy the Client ID into `.env` as `GOOGLE_CLIENT_ID`

### Apple Sign In
1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers)
2. Create a **Services ID** and enable **Sign in with Apple**
3. Add `http://localhost:3000` as a Return URL
4. Create a **Sign in with Apple** key and download the `.p8` file
5. Fill in `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` in `.env`

## Project Structure

```
hsk-flashcards/
├── server/
│   └── index.js        # Express server + auth routes
├── public/
│   ├── login.html      # Sign-in page (Google + Apple)
│   ├── index.html      # Flashcard app
│   └── vocab.json      # 5,000 HSK words (HSK 1-6)
├── .env.example        # Environment variable template
├── package.json
└── README.md
```

## Vocabulary Source

Vocabulary data sourced from [clem109/hsk-vocabulary](https://github.com/clem109/hsk-vocabulary) (MIT License). Traditional characters converted using [hanziconv](https://pypi.org/project/hanziconv/).
