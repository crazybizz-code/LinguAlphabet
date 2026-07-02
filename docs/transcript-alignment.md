# BBC Transcript Alignment Pipeline

The app must not calculate transcript timing at runtime.

BBC Learning English PDFs are the source of truth for transcript wording, but they do not provide timestamps. Accurate synchronized playback therefore requires an import-time forced-alignment step:

1. Download the official BBC MP3.
2. Preserve the official BBC transcript text.
3. Run WhisperX against the MP3 to produce word timestamps from the actual audio.
4. Fuzzy-align the official transcript tokens to the audio-derived word timestamps.
5. Write permanent normalized transcript JSON:

```js
{
  speaker,
  text,
  startMs,
  endMs
}
```

Run:

```sh
python -m pip install whisperx
npm run align:bbc
```

The generated file is written to `src/generated/bbcTranscripts.js`. Commit that generated output after reviewing the validation report. The app should consume the generated transcript JSON directly.

Use `npm run align:bbc -- --skip-asr` only when WhisperX JSON already exists under `.cache/bbc-alignment/<podcastId>/<podcastId>.json`.

