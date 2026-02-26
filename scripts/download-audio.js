#!/usr/bin/env node
/**
 * download-audio.js
 * Downloads pre-recorded Mandarin MP3s from hugolpz/audio-cmn for every HSK word.
 * Run this ONCE on your own machine (not in the Claude container).
 *
 * Usage:
 *   node scripts/download-audio.js
 *
 * Output:
 *   docs/audio/cmn-爱.mp3  (one file per vocabulary word)
 *
 * Source:
 *   https://github.com/hugolpz/audio-cmn  (CC BY-SA 3.0)
 *   96k/hsk quality — native speaker recordings
 *
 * Size estimate: ~5,000 files, ~50-120 MB total
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL  = 'https://raw.githubusercontent.com/hugolpz/audio-cmn/master/96k/hsk';
const OUT_DIR   = path.join(__dirname, '..', 'docs', 'audio');
const VOCAB_DIR = path.join(__dirname, '..', 'public');
const CONCURRENCY = 8;    // parallel downloads — increase if your connection allows
const RETRY_MAX   = 2;    // retries per failed file

// ── Collect all unique simplified words ───────────────────────────────────────
function collectWords() {
  const words = new Set();
  for (let level = 1; level <= 6; level++) {
    const file = path.join(VOCAB_DIR, `vocab-hsk${level}.json`);
    if (!fs.existsSync(file)) { console.warn(`⚠  Missing ${file}`); continue; }
    const vocab = JSON.parse(fs.readFileSync(file, 'utf8'));
    vocab.forEach(v => words.add(v.s));
  }
  return [...words];
}

// ── Download one file ─────────────────────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    // Follow redirects
    function get(u, redirects) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'hsk-flashcard-audio-downloader/1.0' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode === 404) {
          res.resume();
          return resolve('missing');
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const tmp = dest + '.tmp';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          fs.renameSync(tmp, dest);
          resolve('ok');
        });
        out.on('error', reject);
      }).on('error', reject);
    }
    get(url, 0);
  });
}

// ── Retry wrapper ──────────────────────────────────────────────────────────────
async function downloadWithRetry(url, dest, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await download(url, dest);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

// ── Worker pool ───────────────────────────────────────────────────────────────
async function runPool(tasks, concurrency) {
  const results = { ok: 0, missing: 0, skipped: 0, failed: [] };
  let i = 0;
  const startTime = Date.now();

  async function worker() {
    while (i < tasks.length) {
      const task = tasks[i++];
      const { word, url, dest } = task;

      // Skip if already downloaded
      if (fs.existsSync(dest)) {
        results.skipped++;
        if (results.skipped % 100 === 0) process.stdout.write('·');
        continue;
      }

      try {
        const status = await downloadWithRetry(url, dest, RETRY_MAX);
        if (status === 'missing') {
          results.missing++;
        } else {
          results.ok++;
          if (results.ok % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const pct = ((results.ok + results.missing) / tasks.length * 100).toFixed(0);
            process.stdout.write(`\r  ✓ ${results.ok} downloaded, ${results.missing} missing — ${pct}% (${elapsed}s)  `);
          }
        }
      } catch (err) {
        results.failed.push({ word, err: err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🎵 HSK Audio Downloader — hugolpz/audio-cmn (CC BY-SA 3.0)\n');

  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Collect words
  const words = collectWords();
  console.log(`📚 ${words.length} unique words across HSK 1–6`);

  // Build task list
  const tasks = words.map(word => {
    const filename = `cmn-${word}.mp3`;
    return {
      word,
      url:  `${BASE_URL}/${encodeURIComponent(filename)}`,
      dest: path.join(OUT_DIR, filename),
    };
  });

  // Count already downloaded
  const existing = tasks.filter(t => fs.existsSync(t.dest)).length;
  if (existing > 0) {
    console.log(`⏭  ${existing} files already downloaded — skipping`);
  }

  console.log(`⬇  Downloading with ${CONCURRENCY} parallel connections...\n`);

  const results = await runPool(tasks, CONCURRENCY);

  console.log('\n\n── Results ──────────────────────────────────────────────────');
  console.log(`  ✅ Downloaded : ${results.ok}`);
  console.log(`  ⏭  Skipped   : ${results.skipped} (already existed)`);
  console.log(`  ⚠  Missing   : ${results.missing} (not in audio-cmn)`);
  if (results.failed.length) {
    console.log(`  ❌ Failed    : ${results.failed.length}`);
    results.failed.slice(0, 10).forEach(f => console.log(`     ${f.word}: ${f.err}`));
  }

  // Report total size
  let totalBytes = 0;
  fs.readdirSync(OUT_DIR).forEach(f => {
    if (f.endsWith('.mp3')) {
      totalBytes += fs.statSync(path.join(OUT_DIR, f)).size;
    }
  });
  console.log(`\n  📦 Total audio size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  // Write missing words list so the fallback TTS knows which words have no MP3
  const missingWords = tasks
    .filter(t => !fs.existsSync(t.dest))
    .map(t => t.word);

  if (missingWords.length) {
    const missingFile = path.join(OUT_DIR, '_missing.json');
    fs.writeFileSync(missingFile, JSON.stringify(missingWords, null, 2), 'utf8');
    console.log(`\n  📝 Missing words list saved to docs/audio/_missing.json`);
    console.log(`     These will automatically fall back to browser TTS.`);
  }

  console.log('\n✨ Done! Commit docs/audio/ to your repo and push to GitHub Pages.\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
