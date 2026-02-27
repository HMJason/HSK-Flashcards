"""
upload_sentence_audio.py
========================
Zips sentence_audio/ into chunks and uploads them to a GitHub Release using the
GitHub CLI (gh). Splits into chunks because individual files can be large.

REQUIREMENTS:
  - gh CLI installed and authenticated: https://cli.github.com/
  - Run AFTER generate_sentence_audio.py

RUN:
  python upload_sentence_audio.py
"""

import os
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = "HMJason/HSK-Flashcards"
RELEASE_TAG = "sentence-audio-v1"
RELEASE_TITLE = "Example Sentence Audio (edge-tts zh-CN-XiaoxiaoNeural)"
AUDIO_DIR = Path("sentence_audio")
CHUNK_SIZE = 800   # files per zip (keeps zips ~40MB each)

def run(cmd, check=True):
    print(f"$ {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip(), file=sys.stderr)
    if check and result.returncode != 0:
        print(f"Command failed with code {result.returncode}")
        sys.exit(1)
    return result

def main():
    if not AUDIO_DIR.exists():
        print(f"ERROR: {AUDIO_DIR} not found. Run generate_sentence_audio.py first.")
        sys.exit(1)

    mp3_files = sorted(AUDIO_DIR.glob("*.mp3"))
    print(f"Found {len(mp3_files)} MP3 files in {AUDIO_DIR}/")
    if not mp3_files:
        sys.exit(1)

    # Split into chunks and zip
    zips = []
    for i in range(0, len(mp3_files), CHUNK_SIZE):
        chunk = mp3_files[i:i + CHUNK_SIZE]
        zip_name = f"sentence_audio_part{i // CHUNK_SIZE + 1}.zip"
        print(f"Creating {zip_name} ({len(chunk)} files)...")
        with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in chunk:
                zf.write(f, f.name)
        size_mb = os.path.getsize(zip_name) / 1024 / 1024
        print(f"  {zip_name}: {size_mb:.1f} MB")
        zips.append(zip_name)

    # Check if release already exists
    result = run(f'gh release view {RELEASE_TAG} --repo {REPO}', check=False)
    if result.returncode != 0:
        # Create release
        print(f"\nCreating GitHub Release '{RELEASE_TAG}'...")
        run(f'gh release create {RELEASE_TAG} --repo {REPO} --title "{RELEASE_TITLE}" --notes "Pre-generated Mandarin sentence audio using edge-tts zh-CN-XiaoxiaoNeural. One MP3 per HSK example sentence."')
    else:
        print(f"\nRelease '{RELEASE_TAG}' already exists, uploading to it...")

    # Upload each zip
    for zip_name in zips:
        print(f"\nUploading {zip_name}...")
        run(f'gh release upload {RELEASE_TAG} {zip_name} --repo {REPO} --clobber')

    # Cleanup zips
    for z in zips:
        os.remove(z)

    print("\n✓ All done! Update SENTENCE_AUDIO_BASE in flashcards.html to:")
    print(f"  https://github.com/{REPO}/releases/download/{RELEASE_TAG}/")

if __name__ == "__main__":
    main()
