# Preset voice references

Voice presets in `apps/studio/web/src/lib/voice-settings-presets.ts` can point at a
bundled reference clip here (resolved to an absolute path by
`apps/studio/lib/tts/voice-reference-path.mjs` at generation and preview time).
Chatterbox clones the voice in that clip instead of using its default speaker.

`*.wav` files in this directory are **gitignored** — they are personal voice
recordings and are not published. To use the **Campfire Sage** preset, drop a
~15–30s clean, single-speaker `campfire-sage.wav` here (any audio file converted
to wav works; 24 kHz mono is ideal). Until a clip is present, generation falls
back to Chatterbox's default voice.
