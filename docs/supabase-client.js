// ══════════════════════════════════════════════════════════════════════════════
// Supabase Client — shared across login.html, flashcards, conversation
//
// 👉 Replace the two placeholder values below with your project's values.
//    Find them at: Supabase Dashboard → Project Settings → API
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'YOUR_SUPABASE_URL';        // e.g. https://xyz.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';   // public anon key, safe for browser

// Detect environment
const _isNative    = !!(window.Capacitor?.isNativePlatform?.());
const _isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// Deep-link scheme for mobile OAuth redirect
const MOBILE_REDIRECT = 'hsk-flashcards://login-callback';

// Web redirect: wherever the login page is
const WEB_REDIRECT = _isLocalhost
  ? 'http://localhost:3000/login.html'
  : 'https://hmjason.github.io/HSK-Flashcards/login.html';

// Auth redirect based on platform
const AUTH_REDIRECT = _isNative ? MOBILE_REDIRECT : WEB_REDIRECT;

// ─── Create the client ────────────────────────────────────────────────────────
if (!window.supabase) {
  console.error('[supabase-client] @supabase/supabase-js not loaded. Add the CDN script before this file.');
}

const { createClient } = window.supabase;
window._sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType:          'pkce',          // required for secure mobile OAuth
    detectSessionInUrl: true,           // picks up OAuth redirect hash/query
    persistSession:     true,           // keeps session across page reloads
    autoRefreshToken:   true,
    storageKey:         'hsk_session',
  }
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** Returns the current user or null */
async function sbGetUser() {
  const { data: { user } } = await window._sb.auth.getUser();
  return user;
}

/** Sign in with Google — opens OAuth flow */
async function sbSignInGoogle() {
  if (_isNative) {
    // On native: open OAuth in in-app browser using Capacitor Browser plugin
    const { data, error } = await window._sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true }
    });
    if (error) throw error;
    if (data?.url && window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url: data.url });
    } else if (data?.url) {
      window.location.href = data.url;
    }
  } else {
    const { error } = await window._sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: AUTH_REDIRECT }
    });
    if (error) throw error;
  }
}

/** Sign in with Apple — opens OAuth flow */
async function sbSignInApple() {
  if (_isNative) {
    const { data, error } = await window._sb.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true }
    });
    if (error) throw error;
    if (data?.url && window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url: data.url });
    } else if (data?.url) {
      window.location.href = data.url;
    }
  } else {
    const { error } = await window._sb.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: AUTH_REDIRECT }
    });
    if (error) throw error;
  }
}

/** Sign out */
async function sbSignOut() {
  await window._sb.auth.signOut();
}

/** Require auth — redirect to login if not signed in */
async function sbRequireAuth(loginPage = 'login.html') {
  const user = await sbGetUser();
  if (!user) {
    window.location.href = loginPage;
    return null;
  }
  return user;
}

// ─── Handle Capacitor deep-link callback after OAuth ─────────────────────────
// When the user returns from OAuth on mobile, the Browser plugin fires this event.
if (_isNative && window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('appUrlOpen', async (event) => {
    if (event.url.startsWith(MOBILE_REDIRECT) || event.url.includes('login-callback')) {
      // Close the in-app browser
      try { await window.Capacitor.Plugins.Browser.close(); } catch {}
      // Let Supabase parse the session from the URL
      const url = new URL(event.url);
      const { error } = await window._sb.auth.exchangeCodeForSession(
        url.searchParams.get('code') || url.hash
      );
      if (!error) {
        // Redirect to main app
        window.location.href = 'flashcards.html';
      }
    }
  });
}

// ─── Entitlements ─────────────────────────────────────────────────────────────
// Free levels: 1, 2, 3.  Paid: 4, 5, 6 (£2 each) or 'all' (£5).
const FREE_LEVELS = ['1', '2', '3'];

/**
 * Returns the user's owned level strings from Supabase.
 * Cached in sessionStorage to avoid repeat DB calls per page.
 */
async function sbGetEntitlements() {
  // Cache hit
  const cached = sessionStorage.getItem('hsk_entitlements');
  if (cached) return JSON.parse(cached);

  const user = await sbGetUser();
  if (!user) return [];

  try {
    const { data } = await window._sb
      .from('user_entitlements')
      .select('levels')
      .eq('user_id', user.id)
      .single();
    const levels = data?.levels ?? [];
    sessionStorage.setItem('hsk_entitlements', JSON.stringify(levels));
    return levels;
  } catch {
    return [];
  }
}

/**
 * Returns true if the user can access the given level (string or number).
 * Free levels always return true.
 */
async function sbHasAccess(level) {
  const l = String(level);
  if (FREE_LEVELS.includes(l) || l === 'all') {
    // 'all' mode: user needs to have bought 'all' or own every paid level
    if (l === 'all') {
      const owned = await sbGetEntitlements();
      return owned.includes('all') ||
             ['4','5','6'].every(x => owned.includes(x));
    }
    return true;
  }
  const owned = await sbGetEntitlements();
  return owned.includes('all') || owned.includes(l);
}

/**
 * Invalidate the entitlements cache (call after a successful purchase).
 */
function sbClearEntitlementCache() {
  sessionStorage.removeItem('hsk_entitlements');
}

/**
 * Start a Stripe Checkout session for the given product key.
 * productKey: 'hsk4' | 'hsk5' | 'hsk6' | 'all'
 * Returns the Stripe Checkout URL to redirect to.
 */
async function sbBuyLevel(productKey) {
  const { data: { session } } = await window._sb.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const fnUrl = SUPABASE_URL + '/functions/v1/create-checkout';
  const res = await fetch(fnUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ productKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Checkout failed');
  return data.url;  // Stripe-hosted checkout page
}

console.log('[supabase-client] ready — native:', _isNative);
