"""
generate_sentence_audio.py
==========================
Generates Mandarin MP3 audio for all HSK example sentences using edge-tts.
Uses Microsoft Neural voice zh-CN-XiaoxiaoNeural (female, natural, clear).

REQUIREMENTS:
  pip install edge-tts

RUN FROM the repo root (next to docs/):
  python generate_sentence_audio.py

OUTPUT:
  sentence_audio/
    爱_sentence.mp3
    八_sentence.mp3
    ...  (one file per HSK word, named by the word)

THEN upload sentence_audio/ to a GitHub Release (see README instructions below).
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"   # clear female Mandarin — change to zh-CN-YunxiNeural for male
OUT_DIR = Path("sentence_audio")
EXAMPLES_FILES = [f"docs/examples-hsk{i}.json" for i in range(1, 7)]
RATE = "+0%"     # speech rate — "+10%" for slightly faster, "-10%" for slower

async def generate(word: str, text: str, out_path: Path) -> bool:
    """Generate one MP3. Returns True on success."""
    try:
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
        await communicate.save(str(out_path))
        return True
    except Exception as e:
        print(f"  ERROR {word}: {e}", file=sys.stderr)
        return False

async def main():
    OUT_DIR.mkdir(exist_ok=True)

    # Collect all sentences from all HSK levels
    sentences: dict[str, str] = {}  # word → zh sentence
    for fn in EXAMPLES_FILES:
        try:
            with open(fn, encoding="utf-8") as f:
                data = json.load(f)
            for word, entry in data.items():
                zh = entry.get("zh", "").strip()
                if zh and word not in sentences:
                    sentences[word] = zh
        except FileNotFoundError:
            print(f"Warning: {fn} not found, skipping")

    total = len(sentences)
    print(f"Generating audio for {total} sentences using {VOICE}...")
    print(f"Output dir: {OUT_DIR.resolve()}\n")

    done = 0
    skipped = 0
    failed = 0

    for word, zh in sentences.items():
        # Filename: use word as filename (URL-safe via encoding in app)
        out_path = OUT_DIR / f"{word}_sentence.mp3"

        if out_path.exists():
            skipped += 1
            done += 1
            continue

        ok = await generate(word, zh, out_path)
        if ok:
            done += 1
        else:
            failed += 1

        # Progress
        n = done + failed
        if n % 100 == 0 or n == total:
            pct = n / total * 100
            print(f"  {n}/{total} ({pct:.0f}%)  skipped={skipped}  failed={failed}")

        # Small delay to avoid rate limiting
        await asyncio.sleep(0.05)

    print(f"\nDone! {done} generated, {skipped} skipped (already existed), {failed} failed.")
    print(f"\nNext step: upload the '{OUT_DIR}' folder to a GitHub Release.")
    print("See the comment at the top of this file for instructions.")

if __name__ == "__main__":
    asyncio.run(main())
