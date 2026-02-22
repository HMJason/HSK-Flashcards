const admin = require('firebase-admin');

// ─── Initialise ───────────────────────────────────────────────────────────────
let db;

function init() {
  if (admin.apps.length) return; // already initialised

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn('⚠️  Firebase not configured — metrics will not be persisted.');
    console.warn('   Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to .env');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  db = admin.firestore();
  console.log('🔥 Firebase connected');
}

function getDb() { return db; }

// ─── Firestore Schema ─────────────────────────────────────────────────────────
//
//  users/{uid}
//    provider        'google' | 'apple'
//    name            string
//    email           string
//    avatar          string | null
//    createdAt       timestamp
//    lastLoginAt     timestamp
//    totalSessions   number
//    totalCards      number          ← lifetime cards reviewed
//    totalTime       number          ← lifetime seconds in-app
//
//  sessions/{sessionId}
//    uid             string
//    level           'all' | 1-6
//    startedAt       timestamp
//    endedAt         timestamp | null
//    durationSeconds number | null
//    cardsReviewed   number
//    cardsCorrect    number          ← good + perfect recall
//    levelBreakdown  { 1: n, 2: n … }
//
//  progress/{uid}
//    levelStats      { all: {reviewed,correct,time}, 1: {…}, … }
//    dailyStreak     number
//    lastStudyDate   string          ← 'YYYY-MM-DD'
//    weeklyTarget    number          ← cards/week goal (default 100)
//    weeklyProgress  number          ← cards this week
//    weekStart       string          ← 'YYYY-MM-DD' of current week Monday

// ─── Users ────────────────────────────────────────────────────────────────────

async function upsertUser(user) {
  if (!db) return { isNewUser: false };
  const ref  = db.collection('users').doc(user.id);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      provider:           user.provider,
      name:               user.name,
      email:              user.email,
      avatar:             user.avatar || null,
      createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt:        admin.firestore.FieldValue.serverTimestamp(),
      totalSessions:      0,
      totalCards:         0,
      totalTime:          0,
      onboardingComplete: false,
    });
    return { isNewUser: true };
  } else {
    await ref.update({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      name:        user.name,
      avatar:      user.avatar || null,
    });
    return { isNewUser: !snap.data().onboardingComplete };
  }
}

async function completeOnboarding(uid) {
  if (!db) return;
  await db.collection('users').doc(uid).update({ onboardingComplete: true });
}

async function getUser(uid) {
  if (!db) return null;
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function startSession(uid, level) {
  if (!db) return null;
  const ref = await db.collection('sessions').add({
    uid,
    level,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    endedAt: null,
    durationSeconds: null,
    cardsReviewed: 0,
    cardsCorrect: 0,
    levelBreakdown: {},
  });
  // Increment user session count
  db.collection('users').doc(uid).update({
    totalSessions: admin.firestore.FieldValue.increment(1),
  });
  return ref.id;
}

async function endSession(sessionId, { cardsReviewed, cardsCorrect, durationSeconds, levelBreakdown }) {
  if (!db || !sessionId) return;
  const ref = db.collection('sessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  await ref.update({
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
    durationSeconds,
    cardsReviewed,
    cardsCorrect,
    levelBreakdown,
  });

  // Update user lifetime totals
  const uid = snap.data().uid;
  await db.collection('users').doc(uid).update({
    totalCards: admin.firestore.FieldValue.increment(cardsReviewed),
    totalTime:  admin.firestore.FieldValue.increment(durationSeconds),
  });

  // Update progress
  await updateProgress(uid, snap.data().level, { cardsReviewed, cardsCorrect, durationSeconds });
}

// ─── Progress ─────────────────────────────────────────────────────────────────

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function toDateStr(date = new Date()) {
  return date.toISOString().split('T')[0];
}

async function updateProgress(uid, level, { cardsReviewed, cardsCorrect, durationSeconds }) {
  if (!db) return;
  const ref = db.collection('progress').doc(uid);
  const snap = await ref.get();
  const today = toDateStr();
  const weekStart = getWeekStart();

  if (!snap.exists) {
    // Create initial progress doc
    await ref.set({
      levelStats: {
        all: { reviewed: 0, correct: 0, time: 0 },
        1: { reviewed: 0, correct: 0, time: 0 },
        2: { reviewed: 0, correct: 0, time: 0 },
        3: { reviewed: 0, correct: 0, time: 0 },
        4: { reviewed: 0, correct: 0, time: 0 },
        5: { reviewed: 0, correct: 0, time: 0 },
        6: { reviewed: 0, correct: 0, time: 0 },
      },
      dailyStreak: 1,
      lastStudyDate: today,
      weeklyTarget: 100,
      weeklyProgress: cardsReviewed,
      weekStart,
    });
    return;
  }

  const data = snap.data();
  const levelKey = String(level);
  const updates = {};

  // Update level stats
  const ls = data.levelStats || {};
  const current = ls[levelKey] || { reviewed: 0, correct: 0, time: 0 };
  updates[`levelStats.${levelKey}`] = {
    reviewed: (current.reviewed || 0) + cardsReviewed,
    correct:  (current.correct  || 0) + cardsCorrect,
    time:     (current.time     || 0) + durationSeconds,
  };
  // Also accumulate in 'all' unless it already is 'all'
  if (levelKey !== 'all') {
    const allStat = ls['all'] || { reviewed: 0, correct: 0, time: 0 };
    updates['levelStats.all'] = {
      reviewed: (allStat.reviewed || 0) + cardsReviewed,
      correct:  (allStat.correct  || 0) + cardsCorrect,
      time:     (allStat.time     || 0) + durationSeconds,
    };
  }

  // Streak
  const last = data.lastStudyDate;
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  if (last === today) {
    // Same day — streak unchanged
    updates.dailyStreak = data.dailyStreak;
  } else if (last === yesterday) {
    updates.dailyStreak = (data.dailyStreak || 0) + 1;
    updates.lastStudyDate = today;
  } else {
    updates.dailyStreak = 1; // reset
    updates.lastStudyDate = today;
  }

  // Weekly progress
  if (data.weekStart !== weekStart) {
    // New week
    updates.weekStart = weekStart;
    updates.weeklyProgress = cardsReviewed;
  } else {
    updates.weeklyProgress = (data.weeklyProgress || 0) + cardsReviewed;
  }

  await ref.update(updates);
}

async function getProgress(uid) {
  if (!db) return null;
  const snap = await db.collection('progress').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function setWeeklyTarget(uid, target) {
  if (!db) return;
  await db.collection('progress').doc(uid).set(
    { weeklyTarget: target },
    { merge: true }
  );
}

// ─── Analytics (for dashboard) ────────────────────────────────────────────────

async function getRecentSessions(uid, limit = 10) {
  if (!db) return [];
  const snap = await db.collection('sessions')
    .where('uid', '==', uid)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getTopLevel(uid) {
  if (!db) return null;
  const progress = await getProgress(uid);
  if (!progress?.levelStats) return null;
  const stats = progress.levelStats;
  let top = null, max = 0;
  for (const [k, v] of Object.entries(stats)) {
    if (k !== 'all' && (v.reviewed || 0) > max) {
      max = v.reviewed;
      top = k;
    }
  }
  return top ? { level: top, reviewed: max } : null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  init, getDb,
  upsertUser, getUser, completeOnboarding,
  startSession, endSession,
  getProgress, setWeeklyTarget, updateProgress,
  getRecentSessions, getTopLevel,
  getSettings, saveSettings, SETTINGS_DEFAULTS,
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS = {
  dailyTarget:          20,
  preferredScript:      'simplified',   // 'simplified' | 'traditional'
  defaultLevel:         'all',          // 'all' | 1-6
  soundEnabled:         true,
  notificationsEnabled: false,
  theme:                'cream',        // future: 'dark'
};

async function getSettings(uid) {
  if (!db) return SETTINGS_DEFAULTS;
  const snap = await db.collection('settings').doc(uid).get();
  return snap.exists ? { ...SETTINGS_DEFAULTS, ...snap.data() } : { ...SETTINGS_DEFAULTS };
}

async function saveSettings(uid, updates) {
  if (!db) return;
  const allowed = Object.keys(SETTINGS_DEFAULTS);
  const clean   = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  clean.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('settings').doc(uid).set(clean, { merge: true });

  // Keep weeklyTarget in progress in sync with dailyTarget
  if (clean.dailyTarget != null) {
    await setWeeklyTarget(uid, clean.dailyTarget * 7);
  }
}
