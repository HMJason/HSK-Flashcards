# Audio Files

Pre-recorded Mandarin MP3s from [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn) (CC BY-SA 3.0).

## To populate this folder:

```bash
node scripts/download-audio.js
```

This downloads ~5,000 files (~50–120 MB). The app falls back to browser TTS for
any word without an MP3 here.

## File naming
`cmn-爱.mp3` — prefix `cmn-` + simplified Chinese character(s) + `.mp3`
