#!/usr/bin/env node
/**
 * build-static.js
 * Generates a fully self-contained static version of HSK Flashcards in docs/
 * for deployment to GitHub Pages. No server or Firebase required.
 * All persistence uses localStorage.
 */

const fs   = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, 'docs');
if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS);

// Copy vocab files (full + per-level)
const vocabFiles = ['vocab.json', 'vocab-hsk1.json', 'vocab-hsk2.json',
  'vocab-hsk3.json', 'vocab-hsk4.json', 'vocab-hsk5.json', 'vocab-hsk6.json'];
vocabFiles.forEach(f => {
  const src = path.join(__dirname, 'public', f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DOCS, f));
    console.log('✅ Copied ' + f);
  }
});

// ─── Build index.html ─────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>漢 HSK Flashcards</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Noto+Serif+SC:wght@300;400;500;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
  :root {
    --cream:#f0ebe0; --cream-dark:#e5dfd2; --cream-mid:#ede8dc;
    --gold:#8b6914; --gold-light:#c4a035; --red:#8b1a1a; --red-light:#c0392b;
    --ink:#2c2416; --ink-light:#5a4e3a; --ink-muted:#8a7a62;
    --green:#2d5a3d; --green-light:#4a9062; --blue:#1a3a5c;
    --card-bg:#faf7f2; --border:rgba(139,105,20,0.2);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'EB Garamond',Georgia,serif;background:var(--cream);color:var(--ink);min-height:100vh;
    background-image:radial-gradient(ellipse at 20% 50%,rgba(139,105,20,0.04) 0%,transparent 60%),
    radial-gradient(ellipse at 80% 20%,rgba(139,26,26,0.03) 0%,transparent 50%)}

  /* ── Header ── */
  header{background:var(--cream);border-bottom:1px solid var(--border);padding:0 32px;
    display:flex;align-items:center;justify-content:space-between;height:64px;
    position:sticky;top:0;z-index:100;gap:16px}
  .logo{display:flex;align-items:center;gap:12px;flex-shrink:0;text-decoration:none;color:inherit}
  .logo-char{font-family:'Noto Serif SC',serif;font-size:32px;color:var(--red);font-weight:700;line-height:1}
  .logo-text{font-size:11px;letter-spacing:0.22em;color:var(--ink-muted);text-transform:uppercase}
  .script-toggle{display:flex;background:var(--cream-dark);border-radius:40px;padding:3px;border:1px solid var(--border);flex-shrink:0}
  .script-btn{background:none;border:none;font-family:'EB Garamond',serif;font-size:13px;letter-spacing:0.06em;
    padding:5px 14px;border-radius:30px;cursor:pointer;color:var(--ink-muted);transition:all .25s;white-space:nowrap}
  .script-btn.active{background:var(--card-bg);color:var(--gold);box-shadow:0 1px 4px rgba(0,0,0,.1)}
  .user-area{display:flex;align-items:center;gap:8px;flex-shrink:0}
  .settings-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;
    border:1px solid var(--border);background:none;cursor:pointer;color:var(--ink-muted);transition:all .22s;flex-shrink:0}
  .settings-btn:hover{border-color:var(--gold);color:var(--gold);background:rgba(139,105,20,.05);transform:rotate(30deg)}
  .settings-btn svg{width:17px;height:17px}
  .user-avatar{width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:var(--cream-dark);
    display:flex;align-items:center;justify-content:center;font-family:'Noto Serif SC',serif;
    font-size:14px;color:var(--gold);overflow:hidden;flex-shrink:0}
  .user-avatar img{width:100%;height:100%;object-fit:cover}
  .user-name{font-size:14px;color:var(--ink-light);max-width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  /* ── Nav ── */
  nav{border-bottom:1px solid var(--border);padding:0 32px;display:flex;align-items:center;
    gap:6px;background:var(--cream);flex-wrap:wrap}
  .nav-label{font-size:11px;letter-spacing:0.2em;color:var(--ink-muted);text-transform:uppercase;margin-right:10px}
  .level-btn{border:1px solid transparent;background:none;padding:10px 18px;font-family:'EB Garamond',serif;
    font-size:14px;cursor:pointer;color:var(--ink-light);border-radius:4px;transition:all .2s;margin:8px 2px}
  .level-btn:hover{border-color:var(--border)}
  .level-btn.active{background:var(--gold);color:#fff;border-color:var(--gold)}

  /* ── Stats strip ── */
  .stats-strip{background:var(--cream);border-bottom:1px solid var(--border);padding:0 32px;
    display:flex;align-items:center;justify-content:center;gap:48px}
  .stat{text-align:center;padding:10px 0}
  .stat-num{font-family:'Playfair Display',serif;font-size:22px;font-weight:600;color:var(--ink);line-height:1}
  .stat-label{font-size:10px;letter-spacing:.15em;color:var(--ink-muted);text-transform:uppercase;margin-top:2px}

  /* ── Main ── */
  main{max-width:740px;margin:0 auto;padding:36px 24px 60px}

  /* ── Daily bar ── */
  .daily-bar-section{position:relative;margin-bottom:28px}
  .daily-bar-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
  .daily-bar-label{font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink-muted)}
  .daily-bar-count{font-family:'Playfair Display',serif;font-size:15px;color:var(--ink-light);transition:color .6s}
  .daily-bar-count.complete{color:#2d7a4f;font-weight:600}
  .daily-bar-track{height:10px;background:var(--cream-dark);border-radius:99px;overflow:visible;position:relative;
    box-shadow:inset 0 1px 3px rgba(44,36,22,.08)}
  .daily-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold) 0%,var(--gold-light) 100%);
    transition:width .7s cubic-bezier(.4,0,.2,1),background .8s ease;position:relative;min-width:0;
    box-shadow:0 1px 4px rgba(139,105,20,.35)}
  .daily-bar-fill.complete{background:linear-gradient(90deg,#2d7a4f 0%,#4aaa76 100%);box-shadow:0 1px 8px rgba(45,122,79,.4)}
  .daily-bar-fill::after{content:'';position:absolute;inset:0;border-radius:99px;
    background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.3) 50%,transparent 100%);
    background-size:200% 100%;animation:shimmer 2.2s ease infinite}
  .daily-bar-fill.complete::after{display:none}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .daily-bar-fill::before{content:'';position:absolute;right:-1px;top:50%;transform:translateY(-50%);
    width:14px;height:14px;border-radius:50%;background:var(--gold-light);border:2px solid #fff;
    box-shadow:0 0 0 2px var(--gold-light),0 2px 6px rgba(139,105,20,.4);transition:background .8s,box-shadow .8s}
  .daily-bar-fill.complete::before{background:#4aaa76;box-shadow:0 0 0 2px #4aaa76,0 2px 8px rgba(45,122,79,.5)}
  .daily-bar-fill[style*="width: 0"]::before,.daily-bar-fill[style*="width:0"]::before{opacity:0}
  .daily-bar-ticks{position:absolute;top:0;left:0;right:0;height:10px;pointer-events:none}
  .daily-bar-tick{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.5)}

  /* ── Progress counters ── */
  .progress-counters{display:flex;justify-content:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
  .counter-pill{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:30px;
    padding:6px 18px;font-size:14px;color:var(--ink-light);background:var(--card-bg)}
  .counter-dot{width:8px;height:8px;border-radius:50%}
  .dot-red{background:var(--red-light)}.dot-blue{background:var(--blue)}.dot-green{background:var(--green)}
  .progress-bar-wrap{height:6px;background:var(--cream-dark);border-radius:3px;margin-bottom:32px;overflow:hidden}
  .progress-bar{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--red) 0%,var(--gold) 100%);
    transition:width .6s cubic-bezier(.4,0,.2,1)}

  /* ── Card ── */
  .card{background:var(--card-bg);border:1px solid var(--border);border-radius:4px;padding:40px 44px;
    box-shadow:0 4px 24px rgba(44,36,22,.06);animation:fadeSlide .35s ease}
  @keyframes fadeSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .hsk-badge{display:inline-block;font-size:10px;letter-spacing:.15em;border:1px solid var(--gold-light);
    color:var(--gold);padding:2px 8px;border-radius:2px;margin-bottom:12px}
  .card-top{margin-bottom:20px}
  .card-chinese{font-family:'Noto Serif SC',serif;font-size:56px;color:var(--ink);font-weight:400;line-height:1.1}
  .card-pinyin{font-family:'Playfair Display',serif;font-size:22px;font-style:italic;color:var(--red);margin-top:8px}
  .card-meaning{font-size:16px;color:var(--ink-light);margin-top:4px}
  .card-alt-label{font-size:13px;color:var(--ink-muted);margin-top:6px}
  .card-alt-label span{font-family:'Noto Serif SC',serif;font-size:15px;color:var(--ink-light)}
  .card-divider{border:none;border-top:1px solid var(--border);margin:20px 0}
  .speak-row{display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap}
  .speak-btn{display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:none;
    border-radius:3px;padding:9px 18px;font-family:'EB Garamond',serif;font-size:15px;
    color:var(--ink-light);cursor:pointer;transition:all .2s;text-decoration:none}
  .speak-btn:hover{background:var(--cream-dark);color:var(--ink)}
  .speak-icon{width:18px;height:18px}
  .section-label{font-size:10px;letter-spacing:.25em;color:var(--ink-muted);text-transform:uppercase;
    text-align:center;display:flex;align-items:center;gap:12px;margin-bottom:14px}
  .section-label::before,.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
  .chars-grid{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px}
  .char-tile{border:1px solid var(--border);border-radius:3px;padding:12px 18px;text-align:center;
    background:var(--card-bg);min-width:66px;transition:all .2s}
  .char-tile:hover{border-color:var(--gold-light);box-shadow:0 2px 8px rgba(139,105,20,.1)}
  .char-tile-char{font-family:'Noto Serif SC',serif;font-size:30px;color:var(--ink);display:block}
  .recall-row{display:flex;gap:10px}
  .recall-btn{flex:1;border:1px solid var(--border);background:none;padding:12px 10px;border-radius:3px;
    font-family:'EB Garamond',serif;cursor:pointer;transition:all .22s;color:var(--ink-light)}
  .recall-btn .recall-label{font-size:11px;display:block;color:var(--ink-muted);margin-bottom:2px;letter-spacing:.12em}
  .recall-btn .recall-name{font-size:15px}
  .recall-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(44,36,22,.1)}
  .recall-again:hover{border-color:var(--red-light);color:var(--red);background:rgba(139,26,26,.03)}
  .recall-good:hover{border-color:var(--blue);color:var(--blue);background:rgba(26,58,92,.03)}
  .recall-perfect:hover{border-color:var(--green);color:var(--green);background:rgba(45,90,61,.03)}

  /* ── Loading / Done ── */
  .loading{text-align:center;padding:80px}
  .loading-char{font-family:'Noto Serif SC',serif;font-size:56px;color:var(--gold);animation:pulse 1.5s ease infinite}
  @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
  .loading-text{color:var(--ink-muted);font-size:15px;margin-top:12px;font-style:italic}
  .done-state{text-align:center;padding:60px 40px;background:var(--card-bg);border:1px solid var(--border);
    border-radius:4px;animation:fadeSlide .4s ease}
  .done-char{font-family:'Noto Serif SC',serif;font-size:72px;color:var(--gold);margin-bottom:16px}
  .done-title{font-family:'Playfair Display',serif;font-size:28px;color:var(--ink);margin-bottom:10px}
  .done-subtitle{color:var(--ink-muted);font-size:16px;font-style:italic}
  .restart-btn{margin-top:28px;border:1px solid var(--gold);background:none;padding:12px 32px;
    border-radius:3px;font-family:'EB Garamond',serif;font-size:16px;color:var(--gold);
    cursor:pointer;letter-spacing:.08em;transition:all .2s;display:inline-block;text-decoration:none}
  .restart-btn:hover{background:var(--gold);color:#fff}

  /* ── Toast ── */
  .toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(20px);
    background:#fff;border-radius:16px;padding:18px 28px 18px 22px;
    display:flex;align-items:center;gap:16px;
    box-shadow:0 8px 32px rgba(44,36,22,.14),0 2px 8px rgba(44,36,22,.08),0 0 0 1px rgba(45,122,79,.15);
    z-index:9999;opacity:0;pointer-events:none;
    transition:opacity .4s ease,transform .4s cubic-bezier(.2,.8,.3,1);
    max-width:420px;width:calc(100vw - 48px)}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
  .toast-icon{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#2d7a4f 0%,#4aaa76 100%);
    display:flex;align-items:center;justify-content:center;flex-shrink:0;
    animation:toastPop .5s cubic-bezier(.2,.8,.3,1) .1s both}
  @keyframes toastPop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
  .toast-icon svg{width:22px;height:22px;stroke:#fff}
  .toast-body{flex:1;min-width:0}
  .toast-title{font-family:'Playfair Display',serif;font-size:16px;color:#1a3a2a;font-weight:600;margin-bottom:3px}
  .toast-msg{font-family:'EB Garamond',serif;font-size:14px;color:#5a7a68;line-height:1.4}
  .toast-close{background:none;border:none;cursor:pointer;color:#aaa;padding:4px;border-radius:50%;
    transition:color .2s;flex-shrink:0;line-height:1}
  .toast-close:hover{color:#555}
  .confetti-canvas{position:fixed;inset:0;pointer-events:none;z-index:9998}

  /* ── Overlay / Modals ── */
  .overlay{position:fixed;inset:0;background:rgba(44,36,22,.45);z-index:1000;opacity:0;pointer-events:none;
    transition:opacity .3s ease;backdrop-filter:blur(2px)}
  .overlay.show{opacity:1;pointer-events:auto}
  .modal{position:fixed;z-index:1001;background:var(--card-bg);border:1px solid var(--border);
    box-shadow:0 20px 60px rgba(44,36,22,.18),0 4px 16px rgba(44,36,22,.08);
    display:flex;flex-direction:column}
  .modal-header{padding:28px 32px 0;display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0}
  .modal-title{font-family:'Playfair Display',serif;font-size:22px;color:var(--ink);margin-bottom:4px}
  .modal-sub{font-size:14px;color:var(--ink-muted);font-style:italic}
  .modal-close{background:none;border:none;cursor:pointer;color:var(--ink-muted);padding:4px;
    border-radius:50%;transition:color .2s;margin-top:-4px;flex-shrink:0}
  .modal-close:hover{color:var(--ink)}
  .modal-body{padding:24px 32px;overflow-y:auto;flex:1}
  .modal-footer{padding:20px 32px 28px;border-top:1px solid var(--border);
    display:flex;gap:10px;justify-content:flex-end;flex-shrink:0}

  /* ── Onboarding ── */
  .onboarding-modal{top:50%;left:50%;transform:translate(-50%,-50%) scale(.92);
    border-radius:8px;width:100%;max-width:440px;
    transition:transform .35s cubic-bezier(.2,.8,.3,1),opacity .3s ease;opacity:0}
  .onboarding-modal.show{transform:translate(-50%,-50%) scale(1);opacity:1}
  .onboarding-hero{text-align:center;padding:36px 32px 12px}
  .onboarding-char{font-family:'Noto Serif SC',serif;font-size:64px;color:var(--red);font-weight:700;
    line-height:1;display:block;margin-bottom:16px;filter:drop-shadow(0 2px 10px rgba(139,26,26,.2))}
  .onboarding-title{font-family:'Playfair Display',serif;font-size:24px;color:var(--ink);margin-bottom:8px}
  .onboarding-sub{font-size:15px;color:var(--ink-muted);font-style:italic;line-height:1.5}
  .target-picker{display:flex;flex-direction:column;align-items:center;gap:20px;padding:28px 0 8px}
  .target-display{font-family:'Playfair Display',serif;font-size:72px;color:var(--gold);line-height:1;
    transition:all .15s ease;min-width:120px;text-align:center}
  .target-display-sub{font-size:14px;color:var(--ink-muted);margin-top:-8px;text-align:center;letter-spacing:.08em}
  .target-slider{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:3px;
    outline:none;cursor:pointer;
    background:linear-gradient(90deg,var(--gold) 0%,var(--gold) var(--pct,20%),var(--cream-dark) var(--pct,20%),var(--cream-dark) 100%)}
  .target-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;
    background:var(--gold);border:3px solid #fff;box-shadow:0 2px 8px rgba(139,105,20,.4);cursor:pointer}
  .target-presets{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  .preset-btn{border:1px solid var(--border);background:none;border-radius:20px;padding:6px 16px;
    font-family:'EB Garamond',serif;font-size:14px;color:var(--ink-light);cursor:pointer;transition:all .18s}
  .preset-btn:hover{border-color:var(--gold);color:var(--gold)}
  .preset-btn.active{background:var(--gold);border-color:var(--gold);color:#fff}

  /* ── Settings panel ── */
  .settings-panel{top:0;right:0;bottom:0;width:100%;max-width:400px;border-radius:0;border-right:none;
    transform:translateX(100%);transition:transform .35s cubic-bezier(.2,.8,.3,1)}
  .settings-panel.show{transform:translateX(0)}
  .settings-section{margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border)}
  .settings-section:last-child{border-bottom:none;margin-bottom:0}
  .settings-section-title{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:16px}
  .settings-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;gap:16px}
  .settings-row-label{font-size:15px;color:var(--ink)}
  .settings-row-sub{font-size:12px;color:var(--ink-muted);margin-top:1px}
  .stepper{display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden}
  .stepper-btn{background:var(--cream-dark);border:none;width:34px;height:34px;font-size:18px;
    cursor:pointer;color:var(--ink-light);transition:background .15s;display:flex;align-items:center;justify-content:center}
  .stepper-btn:hover{background:var(--cream);color:var(--gold)}
  .stepper-val{width:52px;text-align:center;font-family:'Playfair Display',serif;font-size:18px;
    color:var(--ink);background:var(--card-bg);border:none;padding:0;outline:none}
  .toggle-wrap{position:relative;width:44px;height:24px;flex-shrink:0}
  .toggle-wrap input{opacity:0;width:0;height:0}
  .toggle-track{position:absolute;inset:0;border-radius:12px;background:var(--cream-dark);
    border:1px solid var(--border);cursor:pointer;transition:background .25s,border-color .25s}
  .toggle-track::before{content:'';position:absolute;width:18px;height:18px;border-radius:50%;
    background:#fff;top:2px;left:2px;box-shadow:0 1px 4px rgba(0,0,0,.15);
    transition:transform .25s cubic-bezier(.4,0,.2,1)}
  .toggle-wrap input:checked+.toggle-track{background:var(--gold);border-color:var(--gold)}
  .toggle-wrap input:checked+.toggle-track::before{transform:translateX(20px)}
  .segment{display:flex;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--cream-dark)}
  .segment-btn{flex:1;border:none;background:none;padding:8px 12px;font-family:'EB Garamond',serif;
    font-size:14px;cursor:pointer;color:var(--ink-muted);transition:all .18s;white-space:nowrap}
  .segment-btn.active{background:var(--card-bg);color:var(--gold);box-shadow:inset 0 1px 4px rgba(0,0,0,.06)}
  .settings-select{border:1px solid var(--border);background:var(--card-bg);border-radius:4px;
    padding:7px 10px;font-family:'EB Garamond',serif;font-size:15px;color:var(--ink);
    cursor:pointer;outline:none;min-width:110px}
  .settings-select:focus{border-color:var(--gold)}
  .danger-btn{width:100%;border:1px solid rgba(139,26,26,.25);background:none;border-radius:3px;
    padding:10px;font-family:'EB Garamond',serif;font-size:15px;color:var(--red);
    cursor:pointer;transition:all .2s;text-align:left}
  .danger-btn:hover{background:rgba(139,26,26,.04);border-color:var(--red)}
  .btn-primary{border:1px solid var(--gold);background:var(--gold);border-radius:3px;padding:10px 24px;
    font-family:'EB Garamond',serif;font-size:16px;color:#fff;cursor:pointer;transition:all .2s;letter-spacing:.04em}
  .btn-primary:hover{background:#7a5c12;border-color:#7a5c12}
  .btn-secondary{border:1px solid var(--border);background:none;border-radius:3px;padding:10px 20px;
    font-family:'EB Garamond',serif;font-size:16px;color:var(--ink-light);cursor:pointer;transition:all .2s}
  .btn-secondary:hover{border-color:var(--ink-muted);color:var(--ink)}

  /* ── Name modal (replaces login for static) ── */
  .name-modal{top:50%;left:50%;transform:translate(-50%,-50%) scale(.92);
    border-radius:8px;width:100%;max-width:400px;
    transition:transform .35s cubic-bezier(.2,.8,.3,1),opacity .3s ease;opacity:0}
  .name-modal.show{transform:translate(-50%,-50%) scale(1);opacity:1}
  .name-input{width:100%;border:1px solid var(--border);background:var(--cream);border-radius:4px;
    padding:12px 16px;font-family:'EB Garamond',serif;font-size:18px;color:var(--ink);
    outline:none;text-align:center;margin:16px 0 8px}
  .name-input:focus{border-color:var(--gold)}

  @media(max-width:700px){
    header{padding:0 16px;gap:10px} nav{padding:0 12px}
    .logo-text{display:none} .user-name{display:none}
    .stats-strip{gap:28px;padding:0 16px} main{padding:20px 12px}
    .card{padding:24px 18px} .card-chinese{font-size:40px}
    .recall-label{display:none!important} .toast{bottom:20px}
    .settings-panel{max-width:100%} .modal-body{padding:20px}
    .modal-header{padding:20px 20px 0} .modal-footer{padding:16px 20px 24px}
    .onboarding-char{font-size:48px} .target-display{font-size:56px}
  }
</style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-char">漢</div>
    <div class="logo-text">HSK Flashcards</div>
  </div>
  <div class="script-toggle">
    <button class="script-btn active" onclick="setScript('simplified',this)">Simplified</button>
    <button class="script-btn" onclick="setScript('traditional',this)">Traditional</button>
  </div>
  <div class="user-area">
    <button class="settings-btn" onclick="openSettings()" aria-label="Settings" title="Settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    </button>
    <div class="user-avatar" id="userAvatar">漢</div>
    <span class="user-name" id="userName"></span>
  </div>
</header>

<nav>
  <span class="nav-label">Level:</span>
  <button class="level-btn" onclick="setLevel('all',this)">All HSK</button>
  <button class="level-btn active" onclick="setLevel(1,this)">HSK 1</button>
  <button class="level-btn" onclick="setLevel(2,this)">HSK 2</button>
  <button class="level-btn" onclick="setLevel(3,this)">HSK 3</button>
  <button class="level-btn" onclick="setLevel(4,this)">HSK 4</button>
  <button class="level-btn" onclick="setLevel(5,this)">HSK 5</button>
  <button class="level-btn" onclick="setLevel(6,this)">HSK 6</button>
</nav>
<div class="stats-strip">
  <div class="stat"><div class="stat-num" id="statDue">—</div><div class="stat-label">Due Today</div></div>
  <div class="stat"><div class="stat-num" id="statReviewed">0</div><div class="stat-label">Reviewed</div></div>
  <div class="stat"><div class="stat-num" id="statStreak">—</div><div class="stat-label">Day Streak</div></div>
</div>

<main>
  <div class="daily-bar-section">
    <div class="daily-bar-header">
      <span class="daily-bar-label">Daily Target</span>
      <span class="daily-bar-count" id="dailyBarCount">0 / 20 cards</span>
    </div>
    <div class="daily-bar-track">
      <div class="daily-bar-fill" id="dailyBarFill" style="width:0%"></div>
      <div class="daily-bar-ticks" id="dailyBarTicks"></div>
    </div>
  </div>
  <div class="progress-counters">
    <div class="counter-pill"><span class="counter-dot dot-red"></span><span id="countNew">—</span> New</div>
    <div class="counter-pill"><span class="counter-dot dot-blue"></span><span id="countReview">0</span> Review</div>
    <div class="counter-pill"><span class="counter-dot dot-green"></span><span id="countDone">0</span> Done</div>
  </div>
  <div class="progress-bar-wrap"><div class="progress-bar" id="progressBar" style="width:0%"></div></div>
  <div id="cardContainer">
    <div class="loading"><div class="loading-char">漢</div><div class="loading-text">Loading 5,000 words…</div></div>
  </div>
</main>

<!-- Toast -->
<div class="toast" id="toast" role="alert">
  <div class="toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
  <div class="toast-body">
    <div class="toast-title">Daily target reached! 🎉</div>
    <div class="toast-msg">Well done — your daily target is met! Now keep going!</div>
  </div>
  <button class="toast-close" onclick="dismissToast()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
</div>
<canvas class="confetti-canvas" id="confettiCanvas"></canvas>

<!-- Shared overlay -->
<div class="overlay" id="overlay" onclick="closeAll()"></div>

<!-- Name modal (first visit) -->
<div class="modal name-modal" id="nameModal">
  <div class="onboarding-hero">
    <span class="onboarding-char">歡</span>
    <div class="onboarding-title">Welcome to HSK Flashcards!</div>
    <div class="onboarding-sub">5,000 official vocabulary words, HSK 1–6.<br>What should we call you?</div>
  </div>
  <div class="modal-body">
    <input class="name-input" id="nameInput" type="text" placeholder="Your name" maxlength="40"
           onkeydown="if(event.key==='Enter')continueFromName()">
    <div style="text-align:center;font-size:13px;color:var(--ink-muted)">Saved locally — no account needed</div>
    <div class="target-picker" style="padding-top:20px">
      <div>
        <div class="target-display" id="nameTargetDisplay">20</div>
        <div class="target-display-sub">cards per day</div>
      </div>
      <input type="range" class="target-slider" id="nameSlider" min="5" max="100" step="5" value="20"
             oninput="nameSliderChange(this.value)" style="--pct:15%">
      <div class="target-presets">
        <button class="preset-btn" onclick="setNameTarget(5)">5 — Casual</button>
        <button class="preset-btn active" onclick="setNameTarget(20)">20 — Daily</button>
        <button class="preset-btn" onclick="setNameTarget(50)">50 — Intensive</button>
        <button class="preset-btn" onclick="setNameTarget(100)">100 — Hardcore</button>
      </div>
    </div>
  </div>
  <div class="modal-footer" style="justify-content:center;padding-top:16px">
    <button class="btn-primary" style="width:100%;max-width:240px;padding:14px" onclick="continueFromName()">
      Start Learning →
    </button>
  </div>
</div>

<!-- Settings panel -->
<div class="modal settings-panel" id="settingsPanel">
  <div class="modal-header">
    <div><div class="modal-title">Settings</div><div class="modal-sub">Customise your study experience</div></div>
    <button class="modal-close" onclick="closeSettings()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="modal-body">
    <div class="settings-section">
      <div class="settings-section-title">Study Goals</div>
      <div class="settings-row">
        <div><div class="settings-row-label">Daily target</div><div class="settings-row-sub">Cards per day</div></div>
        <div class="stepper">
          <button class="stepper-btn" onclick="stepTarget(-5)">−</button>
          <input class="stepper-val" id="settingsTarget" type="number" value="20" min="5" max="200" onchange="clampTarget()">
          <button class="stepper-btn" onclick="stepTarget(5)">+</button>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Display</div>
      <div class="settings-row">
        <div><div class="settings-row-label">Default script</div><div class="settings-row-sub">Shown on load</div></div>
        <div class="segment" id="scriptSegment">
          <button class="segment-btn active" onclick="setSegment('scriptSegment',this,'preferredScript','simplified')">Simplified</button>
          <button class="segment-btn" onclick="setSegment('scriptSegment',this,'preferredScript','traditional')">Traditional</button>
        </div>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Default level</div><div class="settings-row-sub">Level on load</div></div>
        <select class="settings-select" id="settingsLevel" onchange="pendingSettings.defaultLevel=this.value">
          <option value="all">All HSK</option>
          <option value="1">HSK 1</option><option value="2">HSK 2</option>
          <option value="3">HSK 3</option><option value="4">HSK 4</option>
          <option value="5">HSK 5</option><option value="6">HSK 6</option>
        </select>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Account</div>
      <div class="settings-row">
        <div><div class="settings-row-label" id="settingsUserName">—</div><div class="settings-row-sub">Saved locally</div></div>
        <div class="user-avatar" id="settingsAvatar" style="width:38px;height:38px;font-size:16px">漢</div>
      </div>
    </div>
    <div class="settings-section" style="border-bottom:none">
      <div class="settings-section-title">Data</div>
      <button class="danger-btn" onclick="resetData()">Reset all progress &amp; settings</button>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-secondary" onclick="closeSettings()">Cancel</button>
    <button class="btn-primary" onclick="saveSettings()">Save changes</button>
  </div>
</div>

<script>
// ─── localStorage helpers ──────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v=localStorage.getItem(k); return v!=null?JSON.parse(v):def; } catch{return def;} },
  set: (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)); } catch{} },
};

const SETTINGS_KEY  = 'hsk_settings';
const PROGRESS_KEY  = 'hsk_progress';
const USER_KEY      = 'hsk_user';

const DEFAULT_SETTINGS = {
  dailyTarget: 20, preferredScript: 'simplified',
  defaultLevel: 1, soundEnabled: true,
};

// ─── State ────────────────────────────────────────────────────────────────────
let allVocab=[], script='simplified', currentLevel=1;
let queue=[], doneCount=0, reviewCount=0, reviewed=0, cardsCorrect=0, currentCard=null;
let currentSettings={}, pendingSettings={};
let dailyTarget=20, dailyDone=0, targetNotified=false;
let sessionStart=null;

// ─── Daily bar ────────────────────────────────────────────────────────────────
function initDailyBar(target){
  dailyTarget=target||20;
  const ticks=document.getElementById('dailyBarTicks');
  ticks.innerHTML=[25,50,75].map(p=>'<div class="daily-bar-tick" style="left:'+p+'%"></div>').join('');
  updateDailyBar();
}
function updateDailyBar(){
  const pct=Math.min(100,(dailyDone/dailyTarget)*100);
  const fill=document.getElementById('dailyBarFill');
  const lbl=document.getElementById('dailyBarCount');
  const done=pct>=100;
  fill.style.width=pct+'%';
  fill.classList.toggle('complete',done);
  lbl.classList.toggle('complete',done);
  lbl.textContent=dailyDone+' / '+dailyTarget+' cards'+(done?' ✓':'');
  if(done&&!targetNotified){ targetNotified=true; setTimeout(showToast,400); }
}

// ─── Toast / confetti ─────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(){
  document.getElementById('toast').classList.add('show');
  launchConfetti();
  clearTimeout(toastTimer);
  toastTimer=setTimeout(dismissToast,6000);
}
function dismissToast(){
  document.getElementById('toast').classList.remove('show');
  clearTimeout(toastTimer);
}
function launchConfetti(){
  const canvas=document.getElementById('confettiCanvas');
  const ctx=canvas.getContext('2d');
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  const C=['#8b6914','#c4a035','#2d7a4f','#4aaa76','#8b1a1a','#f0ebe0','#1a3a5c'];
  const p=Array.from({length:90},()=>({
    x:Math.random()*canvas.width,y:Math.random()*canvas.height*.4-canvas.height*.2,
    r:4+Math.random()*5,d:1.5+Math.random()*2.5,c:C[Math.floor(Math.random()*C.length)],
    s:(Math.random()-.5)*3,rot:Math.random()*Math.PI,rsp:(Math.random()-.5)*.1
  }));
  let f=0;
  (function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    p.forEach(q=>{
      ctx.save(); ctx.translate(q.x,q.y); ctx.rotate(q.rot);
      ctx.fillStyle=q.c; ctx.globalAlpha=Math.max(0,1-f/140);
      ctx.fillRect(-q.r/2,-q.r/2,q.r,q.r*.5); ctx.restore();
      q.y+=q.d; q.x+=q.s; q.rot+=q.rsp;
    });
    f++;
    if(f<150) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  })();
}

// ─── User / Settings ─────────────────────────────────────────────────────────
function loadUser(){
  const user=LS.get(USER_KEY, null);
  if(!user){ showNameModal(); return; }

  currentSettings={ ...DEFAULT_SETTINGS, ...LS.get(SETTINGS_KEY, {}) };
  applySettings(currentSettings);

  document.getElementById('userName').textContent=user.name?.split(' ')[0]||'';
  document.getElementById('userAvatar').textContent=(user.name?.[0]||'漢').toUpperCase();
  document.getElementById('settingsUserName').textContent=user.name||'—';
  document.getElementById('settingsAvatar').textContent=(user.name?.[0]||'漢').toUpperCase();

  // Restore today's daily progress
  const prog=LS.get(PROGRESS_KEY,{});
  const today=new Date().toISOString().split('T')[0];
  dailyDone=prog.lastStudyDate===today ? (prog.dailyCards||0) : 0;
  targetNotified=dailyDone>=dailyTarget;
  updateDailyBar();

  // Streak
  const streak=calcStreak(prog);
  document.getElementById('statStreak').textContent=streak;
}

function calcStreak(prog){
  if(!prog.lastStudyDate) return 0;
  const today=new Date().toISOString().split('T')[0];
  const yesterday=new Date(Date.now()-86400000).toISOString().split('T')[0];
  if(prog.lastStudyDate===today||prog.lastStudyDate===yesterday) return prog.streak||1;
  return 0;
}

function applySettings(s){
  dailyTarget=s.dailyTarget||20;
  initDailyBar(dailyTarget);
  script=s.preferredScript||'simplified';
  document.querySelectorAll('.script-btn').forEach(b=>{
    b.classList.toggle('active',b.textContent.toLowerCase().includes(script));
  });
  currentLevel=s.defaultLevel==='all'?'all':parseInt(s.defaultLevel)||'all';
  document.querySelectorAll('.level-btn').forEach(b=>{
    const lv=b.textContent.includes('All')?'all':parseInt(b.textContent.replace('HSK ',''));
    b.classList.toggle('active',String(lv)===String(currentLevel));
  });
  // Populate controls
  const ti=document.getElementById('settingsTarget');
  if(ti) ti.value=s.dailyTarget||20;
  const sel=document.getElementById('settingsLevel');
  if(sel) sel.value=s.defaultLevel||'all';
  const seg=document.getElementById('scriptSegment');
  if(seg) seg.querySelectorAll('.segment-btn').forEach(b=>{
    b.classList.toggle('active',b.textContent.toLowerCase().trim()===(s.preferredScript||'simplified'));
  });
}

// ─── Name modal (first visit) ─────────────────────────────────────────────────
function showNameModal(){
  document.getElementById('overlay').classList.add('show');
  document.getElementById('nameModal').classList.add('show');
  document.body.style.overflow='hidden';
  setTimeout(()=>document.getElementById('nameInput').focus(),400);
}
function nameSliderChange(v){
  const val=parseInt(v);
  document.getElementById('nameTargetDisplay').textContent=val;
  const pct=((val-5)/(100-5))*100;
  document.getElementById('nameSlider').style.setProperty('--pct',pct+'%');
  document.querySelectorAll('.preset-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===val));
}
function setNameTarget(v){
  document.getElementById('nameSlider').value=v;
  nameSliderChange(v);
}
function continueFromName(){
  const name=(document.getElementById('nameInput').value||'').trim()||'Learner';
  const target=parseInt(document.getElementById('nameSlider').value)||20;
  LS.set(USER_KEY,{name,createdAt:new Date().toISOString()});
  LS.set(SETTINGS_KEY,{...DEFAULT_SETTINGS,dailyTarget:target});
  closeAll();
  loadUser();
  // Re-init queue after settings applied (currentLevel may have changed)
  if(allVocab.length) initQueue();
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function openSettings(){
  pendingSettings={...currentSettings};
  applySettings(currentSettings);
  document.getElementById('overlay').classList.add('show');
  document.getElementById('settingsPanel').classList.add('show');
  document.body.style.overflow='hidden';
}
function closeSettings(){
  document.getElementById('settingsPanel').classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
  document.body.style.overflow='';
}
function closeAll(){
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('nameModal').classList.remove('show');
  document.getElementById('settingsPanel').classList.remove('show');
  document.body.style.overflow='';
}
function setSegment(cid,btn,key,val){
  document.getElementById(cid).querySelectorAll('.segment-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  pendingSettings[key]=val;
}
function stepTarget(d){
  const i=document.getElementById('settingsTarget');
  const v=Math.max(5,Math.min(200,(parseInt(i.value)||20)+d));
  i.value=v; pendingSettings.dailyTarget=v;
}
function clampTarget(){
  const i=document.getElementById('settingsTarget');
  const v=Math.max(5,Math.min(200,parseInt(i.value)||20));
  i.value=v; pendingSettings.dailyTarget=v;
}
function saveSettings(){
  const target=parseInt(document.getElementById('settingsTarget').value)||20;
  const level=document.getElementById('settingsLevel').value;
  const seg=document.getElementById('scriptSegment');
  const sc=seg?.querySelector('.segment-btn.active')?.textContent.toLowerCase().trim()||'simplified';
  const updates={...pendingSettings,dailyTarget:target,defaultLevel:level,preferredScript:sc};
  currentSettings={...DEFAULT_SETTINGS,...updates};
  LS.set(SETTINGS_KEY,currentSettings);
  applySettings(currentSettings);
  closeSettings();
  if(allVocab.length) initQueue();
}
function resetData(){
  if(!confirm('Reset all progress and settings? This cannot be undone.')) return;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PROGRESS_KEY);
  location.reload();
}

// ─── Progress persistence ────────────────────────────────────────────────────
function saveProgress(){
  const today=new Date().toISOString().split('T')[0];
  const prog=LS.get(PROGRESS_KEY,{});
  const yesterday=new Date(Date.now()-86400000).toISOString().split('T')[0];
  let streak=prog.streak||0;
  if(prog.lastStudyDate===today) streak=prog.streak||1;
  else if(prog.lastStudyDate===yesterday) streak=(prog.streak||0)+1;
  else streak=1;
  LS.set(PROGRESS_KEY,{
    lastStudyDate:today, dailyCards:dailyDone,
    streak, totalCards:(prog.totalCards||0)+cardsCorrect,
    levelStats:{...(prog.levelStats||{})}
  });
  document.getElementById('statStreak').textContent=streak;
}

// ─── Vocab loading (lazy by level) ────────────────────────────────────────────
const vocabCache={};
async function fetchLevel(level){
  if(vocabCache[level]?.length) return vocabCache[level];
  const url=level==='all'?'vocab.json':'vocab-hsk'+level+'.json';
  const res=await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status+' loading '+url);
  const data=await res.json();
  if(!Array.isArray(data)||!data.length) throw new Error('Empty vocab for level '+level);
  vocabCache[level]=data;
  if(level!=='all'){
    vocabCache['all']=[...(vocabCache['all']||[]),...data];
  }
  return data;
}
async function loadVocab(){
  try{
    const first=currentLevel==='all'?1:currentLevel;
    allVocab=await fetchLevel(first);
    initQueue();
    if(currentLevel==='all'){
      for(const lvl of [2,3,4,5,6]){
        fetchLevel(lvl).then(w=>{
          allVocab=[...allVocab,...w];
          vocabCache['all']=allVocab;
        }).catch(()=>{});
      }
    }
  }catch(e){
    document.getElementById('cardContainer').innerHTML=
      '<div class="done-state"><div class="done-char">！</div><div class="done-title">Could not load vocabulary</div><div class="done-subtitle" style="margin-top:12px">'+e.message+'<br><br>Try refreshing the page.</div></div>';
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────────
function initQueue(){
  queue=(currentLevel==='all'?[...allVocab]:allVocab.filter(v=>v.h===currentLevel)).sort(()=>Math.random()-.5);
  doneCount=0; reviewCount=0; reviewed=0; cardsCorrect=0;
  sessionStart=Date.now();
  updateStats(); showNext();
}
async function setLevel(l,btn){
  currentLevel=l==='all'?'all':parseInt(l);
  document.querySelectorAll('.level-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const cacheKey=currentLevel;
  if(vocabCache[cacheKey]?.length){
    allVocab=vocabCache[cacheKey];
    initQueue();
  } else {
    document.getElementById('cardContainer').innerHTML=
      '<div class="loading"><div class="loading-char">漢</div><div class="loading-text">Loading…</div></div>';
    allVocab=await fetchLevel(currentLevel==='all'?1:currentLevel);
    initQueue();
    if(currentLevel==='all'){
      for(const lvl of [2,3,4,5,6]) fetchLevel(lvl).then(w=>{allVocab=[...allVocab,...w];}).catch(()=>{});
    }
  }
}
function setScript(s,btn){
  script=s;
  document.querySelectorAll('.script-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(currentCard) renderCard(currentCard);
}
function updateStats(){
  const total=queue.length+doneCount;
  document.getElementById('statDue').textContent=queue.length;
  document.getElementById('countNew').textContent=Math.max(0,queue.length-reviewCount);
  document.getElementById('countReview').textContent=reviewCount;
  document.getElementById('countDone').textContent=doneCount;
  document.getElementById('statReviewed').textContent=reviewed;
  document.getElementById('progressBar').style.width=(total>0?(doneCount/total*100):0)+'%';
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function showNext(){
  if(!queue.length){showDone();return;}
  currentCard=queue[0]; renderCard(currentCard);
}
function renderCard(card){
  const isTrad=script==='traditional';
  const chinese=isTrad?card.t:card.s;
  const alt=isTrad?card.s:card.t;
  const showAlt=alt!==chinese;
  const chars=[...chinese];
  const charsHTML=chars.length>1?
    '<div class="section-label">Character Breakdown</div><div class="chars-grid">'+
    chars.map(c=>'<div class="char-tile"><span class="char-tile-char">'+c+'</span></div>').join('')+
    '</div>':'';
  document.getElementById('cardContainer').innerHTML=
    '<div class="card">'+
    '<div class="hsk-badge">HSK '+card.h+'</div>'+
    '<div class="card-top">'+
    '<div class="card-chinese">'+chinese+'</div>'+
    '<div class="card-pinyin">'+card.p+'</div>'+
    '<div class="card-meaning">'+card.m+'</div>'+
    (showAlt?'<div class="card-alt-label">'+(isTrad?'Simplified':'Traditional')+': <span>'+alt+'</span></div>':'')+
    '</div>'+
    '<hr class="card-divider">'+
    '<div class="speak-row">'+
    '<button class="speak-btn" onclick="speakWord()"><svg class="speak-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.536 8.464a5 5 0 010 7.072M9 9.5l-2 1.5H4v3h3l2 1.5V9.5z" stroke-linecap="round" stroke-linejoin="round"/></svg>Speak word</button>'+
    '<button class="speak-btn" onclick="speakPinyin()"><svg class="speak-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01" stroke-linecap="round"/></svg>Pinyin hint</button>'+
    '</div>'+
    charsHTML+
    '<div class="recall-row">'+
    '<button class="recall-btn recall-again" onclick="recall(\'again\')"><span class="recall-label">AGAIN</span><span class="recall-name">Tomorrow</span></button>'+
    '<button class="recall-btn recall-good" onclick="recall(\'good\')"><span class="recall-label">GOOD</span><span class="recall-name">Recall</span></button>'+
    '<button class="recall-btn recall-perfect" onclick="recall(\'perfect\')"><span class="recall-label">PERFECT</span><span class="recall-name">Recall</span></button>'+
    '</div></div>';
}
function recall(type){
  if(!currentCard) return;
  queue.shift(); reviewed++;
  if(type==='again'){
    queue.splice(Math.min(queue.length,5+Math.floor(Math.random()*5)),0,currentCard);
    reviewCount++;
  } else {
    doneCount++;
    if(type==='good'||type==='perfect'){
      cardsCorrect++; dailyDone++;
      updateDailyBar(); saveProgress();
    }
  }
  updateStats(); showNext();
}
function speakWord(){
  if(!currentCard||!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(script==='traditional'?currentCard.t:currentCard.s);
  u.lang='zh-CN'; u.rate=0.8; speechSynthesis.speak(u);
}
function speakPinyin(){
  if(!currentCard||!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(currentCard.p);
  u.lang='en-US'; u.rate=0.75; speechSynthesis.speak(u);
}
function showDone(){
  currentCard=null;
  const lvl=currentLevel==='all'?'All HSK':'HSK '+currentLevel;
  const acc=reviewed>0?Math.round((cardsCorrect/reviewed)*100):0;
  document.getElementById('cardContainer').innerHTML=
    '<div class="done-state"><div class="done-char">完</div>'+
    '<div class="done-title">Session Complete!</div>'+
    '<div class="done-subtitle">You reviewed <strong>'+reviewed+'</strong> '+lvl+' card'+(reviewed!==1?'s':'')+' with <strong>'+acc+'%</strong> accuracy. 很好！</div>'+
    '<button class="restart-btn" onclick="initQueue()" style="margin-top:28px">Study Again</button>'+
    '</div>';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadUser();
loadVocab();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(DOCS, 'index.html'), html);
console.log('✅ Built docs/index.html');
console.log('\\n✨ Static build complete!');
console.log('   Open docs/index.html in a browser, or push to GitHub to deploy via Pages.');
console.log('   Enable Pages: Repo Settings → Pages → Source: master /docs\\n');
