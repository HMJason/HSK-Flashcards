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

// ─── Copy audio/ folder if it exists (pre-recorded MP3s) ──────────────────────
const audioSrc = path.join(DOCS, 'audio');
if (fs.existsSync(audioSrc)) {
  const count = fs.readdirSync(audioSrc).filter(f => f.endsWith('.mp3')).length;
  console.log(`✅ Audio folder present — ${count} MP3 files (already in docs/audio/)`);
} else {
  console.log('ℹ️  No docs/audio/ folder yet — run: node scripts/download-audio.js');
  console.log('   App will fall back to browser TTS until audio is downloaded.');
}

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
// flash = replace(flash, 'href="/dashboard"', 'href="#"'); // removed from source

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

// 3. Replace server loadUser() with Supabase-based localStorage version
// (Supabase is used in static build too — auth guards redirect to login.html)
// No replacement needed — the source loadUser() already works for static/GitHub Pages
// because it checks `location.pathname.endsWith('.html')` for the redirect path.

// ── calcStreak helper (referenced inside applySettings / daily bar logic) ──────
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

// 4. Replace server saveSettings() with localStorage version
flash = replace(flash,
`async function saveSettings() {
  const btn = document.getElementById('settingsSaveBtn');
  btn.textContent = 'Saving…'; btn.disabled = true;

  // Collect all current control values
  const target   = parseInt(document.getElementById('settingsTarget').value) || 20;
  const sound    = document.getElementById('settingsSound')?.checked ?? true;
  const tracking = document.getElementById('settingsTracking').checked;
  const level    = document.getElementById('settingsLevel').value;
  const scriptSeg = document.getElementById('scriptSegment');
  const scriptVal = scriptSeg?.querySelector('.segment-btn.active')?.textContent.toLowerCase().trim() || 'simplified';
  const voiceSel  = document.getElementById('settingsVoice');
  const voiceName = voiceSel?.value || '';
  const speedSeg  = document.getElementById('speedSegment');
  const speechRate = parseFloat(speedSeg?.querySelector('.segment-btn.active')
    ?.getAttribute('onclick')?.match(/[\\d.]+/)?.[0] || '0.85');

  const updates = {
    dailyTarget:      target,
    soundEnabled:     sound,
    trackingEnabled:  tracking,
    defaultLevel:     level,
    preferredScript:  scriptVal,
    voiceName,
    speechRate,
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
  const sound    = document.getElementById('settingsSound')?.checked??true;
  const autoplay = document.getElementById('settingsAutoPlay').checked;
  const tracking = document.getElementById('settingsTracking').checked;
  const level    = document.getElementById('settingsLevel').value;
  const scriptSeg = document.getElementById('scriptSegment');
  const scriptVal = scriptSeg?.querySelector('.segment-btn.active')?.textContent.toLowerCase().trim()||'simplified';
  const voiceSel  = document.getElementById('settingsVoice');
  const voiceName = voiceSel?.value||'';
  const speedSeg  = document.getElementById('speedSegment');
  const speechRate = parseFloat(speedSeg?.querySelector('.segment-btn.active')?.getAttribute('onclick')?.match(/[\\d.]+/)?.[0]||'0.85');
  const updates = {dailyTarget:target,soundEnabled:sound,autoPlayAudio:autoplay,trackingEnabled:tracking,defaultLevel:level,preferredScript:scriptVal,voiceName,speechRate,...pendingSettings,dailyTarget:target};
  window._LS.set('hsk_settings',updates);
  currentSettings=updates;
  applySettings(currentSettings);
  closeSettings();
}`);

// 5. Session tracking: server calls already removed from source, Supabase handles it

// 6c. Add missing calcStreak function is now handled above (step 3)

// 7. Fix error message (remove server reference)
flash = replace(flash,
`Make sure the server is running: <code>npm start</code>`,
`Check your internet connection and try refreshing.`);

fs.writeFileSync(path.join(DOCS,'flashcards.html'), flash);
console.log('✅ Built docs/flashcards.html ('+Math.round(flash.length/1024)+'KB, HSK1 embedded)');

// ─── Copy supabase-client.js to docs/ ────────────────────────────────────────
const sbClientSrc = path.join(PUBLIC, 'supabase-client.js');
if (fs.existsSync(sbClientSrc)) {
  fs.copyFileSync(sbClientSrc, path.join(DOCS, 'supabase-client.js'));
  console.log('✅ Copied supabase-client.js');
}

// ─── Build login.html ─────────────────────────────────────────────────────────
let login = fs.readFileSync(path.join(PUBLIC,'login.html'), 'utf8');
// Fix relative script path (server serves from /supabase-client.js, static uses relative)
login = replace(login, 'src="supabase-client.js"', 'src="supabase-client.js"'); // already relative — no change needed
fs.writeFileSync(path.join(DOCS,'login.html'), login);
console.log('✅ Built docs/login.html');

// ─── Build index.html (landing) ───────────────────────────────────────────────
let landing = fs.readFileSync(path.join(PUBLIC,'landing.html'), 'utf8');
landing = replace(landing, 'href="/home"',         'href="index.html"');
// Replace /app?level=N links (from HSK level grid)
for (let l = 1; l <= 6; l++) {
  landing = landing.split(`href="/app?level=${l}"`).join(`href="flashcards.html?level=${l}"`);
}
landing = landing.split(`href="/app?level=all"`).join(`href="flashcards.html?level=all"`);
landing = replace(landing, 'href="/conversation"', 'href="conversation.html"');
// landing = replace(landing, 'href="/dashboard"', 'href="#"'); // removed from source
// Login/auth redirects already use location.pathname check — no replacement needed
fs.writeFileSync(path.join(DOCS,'index.html'), landing);
console.log('✅ Built docs/index.html (landing)');

// ─── Build conversation.html ──────────────────────────────────────────────────
let conv = fs.readFileSync(path.join(PUBLIC,'conversation.html'), 'utf8');
conv = replace(conv, 'href="/home"', 'href="index.html"');
// Auth already uses Supabase with pathname check — no replacement needed
fs.writeFileSync(path.join(DOCS,'conversation.html'), conv);
console.log('✅ Built docs/conversation.html');

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
