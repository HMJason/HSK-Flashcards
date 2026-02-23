#!/usr/bin/env node
/**
 * build-static.js
 * Generates a fully self-contained static version in docs/ for GitHub Pages.
 * All three pages (landing, flashcards, conversation) are built from their
 * public/ server counterparts via targeted string replacements.
 */

const fs   = require('fs');
const path = require('path');

const DOCS   = path.join(__dirname, 'docs');
const PUBLIC = path.join(__dirname, 'public');
if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS);

// ─── Copy vocab files ──────────────────────────────────────────────────────────
['vocab.json','vocab-hsk1.json','vocab-hsk2.json','vocab-hsk3.json',
 'vocab-hsk4.json','vocab-hsk5.json','vocab-hsk6.json',
 'examples-hsk1.json'].forEach(f => {
  const src = path.join(PUBLIC, f);
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(DOCS, f)); console.log('✅ Copied ' + f); }
});

// ─── Helper ────────────────────────────────────────────────────────────────────
function replace(str, from, to) {
  if (!str.includes(from)) { console.warn('  ⚠️  Pattern not found: ' + from.slice(0, 60)); return str; }
  return str.split(from).join(to);
}

// ─── Build flashcards.html ────────────────────────────────────────────────────
const hsk1Data = JSON.stringify(JSON.parse(fs.readFileSync(path.join(PUBLIC,'vocab-hsk1.json'))));

let flash = fs.readFileSync(path.join(PUBLIC,'index.html'), 'utf8');

// 1. Fix links
flash = replace(flash, 'href="/home"',      'href="index.html"');
flash = replace(flash, 'href="/dashboard"', 'href="#"');

// 2. Rewrite server-side vocab URLs to relative paths for GitHub Pages
flash = replace(flash, "'/app-assets/vocab.json'",             "'vocab.json'");
flash = replace(flash, '`/app-assets/vocab-hsk${level}.json`', '`vocab-hsk${level}.json`');
flash = replace(flash, '`/app-assets/examples-hsk${level}.json`', '`examples-hsk${level}.json`');

// 3. Inject HSK1 & HSK2 vocab inline so first cards appear with zero network delay
const hsk1 = JSON.parse(fs.readFileSync(path.join(PUBLIC,'vocab-hsk1.json')));
const hsk2 = JSON.parse(fs.readFileSync(path.join(PUBLIC,'vocab-hsk2.json')));
const ex1  = JSON.parse(fs.readFileSync(path.join(PUBLIC,'examples-hsk1.json')));
const inlineVocab = `
// ── Inline vocab: HSK1 & HSK2 pre-seeded (zero network fetch for first cards) ──
(function(){
  const h1=${JSON.stringify(hsk1)};
  const h2=${JSON.stringify(hsk2)};
  vocabCache[1]=h1; vocabCache[2]=h2;
  vocabCache['all']=[...h1,...h2];
  // HSK1 examples pre-seeded
  Object.assign(examplesCache,${JSON.stringify(ex1)});
  examplesCache['_loaded1']=true;
})();
`;
flash = replace(flash, 'const examplesCache = {}; // simplified character → {zh, py, en}', 'const examplesCache = {}; // simplified character → {zh, py, en}\n' + inlineVocab);

// 3. Replace server loadUser() with localStorage version — no onboarding, auto-start
flash = replace(flash,
`async function loadUser(){
  let user;
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { window.location.href='/login'; return; }
    user = await res.json();
  } catch { window.location.href='/login'; return; }

  // Render avatar in header
  setAvatarEl('userAvatar', user);

  // Populate settings panel account section
  document.getElementById('settingsUserName').textContent  = user.name  || '—';
  document.getElementById('settingsUserEmail').textContent = user.email || '—';
  document.getElementById('userName').textContent = user.name?.split(' ')[0] || '';
  setAvatarEl('settingsAvatar', user);

  // Load settings from server
  try {
    const sr = await fetch('/api/settings');
    currentSettings = sr.ok ? await sr.json() : { dailyTarget: 20 };
  } catch { currentSettings = { dailyTarget: 20 }; }

  applySettings(currentSettings);

  // Show onboarding if ?new=1 in URL
  if (new URLSearchParams(location.search).get('new') === '1') {
    showOnboarding(user.name);
  }
}`,
`// ── Static localStorage helpers ──
const _LS={
  get:(k,d)=>{try{const v=localStorage.getItem(k);return v!=null?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
};
window._LS=_LS;

function loadUser(){
  const saved=_LS.get('hsk_settings',{});
  currentSettings={dailyTarget:20,soundEnabled:true,autoPlayAudio:true,trackingEnabled:false,preferredScript:'simplified',defaultLevel:1,...saved};
  applySettings(currentSettings);
  const prog=_LS.get('hsk_progress',{});
  const today=new Date().toISOString().split('T')[0];
  dailyDone=prog.lastStudyDate===today?(prog.dailyCards||0):0;
  targetNotified=dailyDone>=dailyTarget;
  updateDailyBar();
  const streak=document.getElementById('statStreak');
  if(streak)streak.textContent=calcStreak(prog);
}`);

// 4. Replace server saveSettings() with localStorage version
flash = replace(flash,
`async function saveSettings() {
  const btn = document.getElementById('settingsSaveBtn');
  btn.textContent = 'Saving…'; btn.disabled = true;

  // Collect all current control values
  const target   = parseInt(document.getElementById('settingsTarget').value) || 20;
  const sound    = document.getElementById('settingsSound').checked;
  const tracking = document.getElementById('settingsTracking').checked;
  const level    = document.getElementById('settingsLevel').value;
  const scriptSeg = document.getElementById('scriptSegment');
  const scriptVal = scriptSeg?.querySelector('.segment-btn.active')?.textContent.toLowerCase().trim() || 'simplified';

  const updates = {
    dailyTarget:      target,
    soundEnabled:     sound,
    trackingEnabled:  tracking,
    defaultLevel:     level,
    preferredScript:  scriptVal,
    ...pendingSettings,
    // overwrite with explicit control values
    dailyTarget:      target,
  };

  try {
    const res  = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.success) {
      currentSettings = data.settings;
      applySettings(currentSettings);
      closeSettings();
    }
  } catch(e) {
    alert('Could not save settings. Please try again.');
  }

  btn.textContent = 'Save changes'; btn.disabled = false;
}`,
`function saveSettings(){
  const target   = parseInt(document.getElementById('settingsTarget').value)||20;
  const sound    = document.getElementById('settingsSound').checked;
  const autoplay = document.getElementById('settingsAutoPlay').checked;
  const tracking = document.getElementById('settingsTracking').checked;
  const level    = document.getElementById('settingsLevel').value;
  const scriptSeg = document.getElementById('scriptSegment');
  const scriptVal = scriptSeg?.querySelector('.segment-btn.active')?.textContent.toLowerCase().trim()||'simplified';
  const updates = {dailyTarget:target,soundEnabled:sound,autoPlayAudio:autoplay,trackingEnabled:tracking,defaultLevel:level,preferredScript:scriptVal,...pendingSettings,dailyTarget:target};
  window._LS.set('hsk_settings',updates);
  currentSettings=updates;
  applySettings(currentSettings);
  closeSettings();
}`);

// 5. Replace server logout with localStorage version
flash = replace(flash,
`async function logout(){
  await endSession();
  await fetch('/auth/logout', { method:'POST' });
  window.location.href='/login';
}`,
`function logout(){
  if(confirm('Sign out and clear all local data?')){localStorage.clear();location.reload();}
}`);

// 6. Strip session start/end API calls (just make them no-ops)
flash = replace(flash,
`async function startSession(){`,
`async function startSession(){ return;`);
flash = replace(flash,
`async function endSession(){`,
`async function endSession(){ return;`);

// 6b. Remove the beforeunload sendBeacon (calls non-existent server endpoint)
flash = replace(flash,
`// End session on page close
window.addEventListener('beforeunload', () => {
  if(sessionStart && reviewed > 0) {
    const duration = Math.round((Date.now()-sessionStart)/1000);
    navigator.sendBeacon('/api/session/end', JSON.stringify({
      sessionId, cardsReviewed:reviewed, cardsCorrect, durationSeconds:duration, levelBreakdown
    }));
  }
});`,
`// (session tracking disabled in static build)`);

// 6c. Add missing calcStreak function (used in loadUser)
flash = replace(flash,
`// ─── Data loading`,
`// ── calcStreak: count consecutive daily study days ──
function calcStreak(prog){
  if(!prog||!prog.lastStudyDate) return 0;
  const today=new Date().toISOString().split('T')[0];
  const last=prog.lastStudyDate;
  if(last===today) return prog.streak||1;
  const diff=(new Date(today)-new Date(last))/(1000*60*60*24);
  return diff<=1 ? (prog.streak||1) : 0;
}

// ─── Data loading`);

// 7. Fix error message (remove server reference)
flash = replace(flash,
`Make sure the server is running: <code>npm start</code>`,
`Check your internet connection and try refreshing.`);

fs.writeFileSync(path.join(DOCS,'flashcards.html'), flash);
console.log('✅ Built docs/flashcards.html ('+Math.round(flash.length/1024)+'KB, HSK1 embedded)');

// ─── Build index.html (landing) ───────────────────────────────────────────────
let landing = fs.readFileSync(path.join(PUBLIC,'landing.html'), 'utf8');
landing = replace(landing, 'href="/home"',         'href="index.html"');
landing = replace(landing, 'href="/app"',          'href="flashcards.html"');
landing = replace(landing, 'href="/conversation"', 'href="conversation.html"');
landing = replace(landing, 'href="/dashboard"',    'href="#"');
landing = replace(landing,
`async function loadUser() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { window.location.href = '/login'; return; }
    const user = await res.json();
    document.getElementById('userName').textContent = user.name?.split(' ')[0] || '';
    const av = document.getElementById('userAvatar');
    if (user.avatar) {
      av.innerHTML = \`<img src="\${user.avatar}" alt="\${user.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">\`;
    } else {
      av.textContent = (user.name?.[0] || '漢').toUpperCase();
    }
  } catch { window.location.href = '/login'; }
}
async function signOut() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}
loadUser();`,
`const _LS={get:(k,d)=>{try{const v=localStorage.getItem(k);return v!=null?JSON.parse(v):d}catch{return d}}};
function loadUser(){
  const user=_LS.get('hsk_user',null);
  if(user){
    document.getElementById('userName').textContent=user.name?.split(' ')[0]||'';
    document.getElementById('userAvatar').textContent=(user.name?.[0]||'漢').toUpperCase();
  }
}
function signOut(){if(confirm('Clear all local data?')){localStorage.clear();location.reload();}}
loadUser();`);
fs.writeFileSync(path.join(DOCS,'index.html'), landing);
console.log('✅ Built docs/index.html (landing)');

// ─── Build conversation.html ──────────────────────────────────────────────────
let conv = fs.readFileSync(path.join(PUBLIC,'conversation.html'), 'utf8');
conv = replace(conv, 'href="/home"', 'href="index.html"');
// Replace the auth fetch with a localStorage lookup
conv = conv.replace(/async function loadUser\(\)[\s\S]*?\}\nloadUser\(\);/,
  `function loadUser(){
  var _ls={get:function(k,d){try{var v=localStorage.getItem(k);return v!=null?JSON.parse(v):d;}catch(e){return d;}}};
  var u=_ls.get('hsk_user',null);
  var av=document.getElementById('userAvatar');
  if(u&&av) av.textContent=(u.name&&u.name[0]||'\u6f22').toUpperCase();
}
loadUser();`);
fs.writeFileSync(path.join(DOCS,'conversation.html'), conv);
console.log('\u2705 Built docs/conversation.html');

// ─── Verify JS syntax in all outputs ──────────────────────────────────────────
const {execSync} = require('child_process');
[DOCS+'/flashcards.html', DOCS+'/conversation.html'].forEach(f => {
  const html = fs.readFileSync(f,'utf8');
  const start = html.indexOf('<script>', html.indexOf('<body>')) + 8;
  const end   = html.lastIndexOf('</script>');
  fs.writeFileSync('/tmp/_syntax_check.js', html.slice(start, end));
  try { execSync('node --check /tmp/_syntax_check.js'); console.log('  ✅ JS syntax OK: '+path.basename(f)); }
  catch(e) { console.error('  ❌ JS syntax ERROR: '+path.basename(f)); console.error(e.message); }
});

console.log('\n✨ Static build complete!\n');
