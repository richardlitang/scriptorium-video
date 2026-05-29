# Multilingual Voice And Visual Consistency

This project now supports generic language-aware TTS routing and visual consistency metadata.

## Language-Aware TTS Routing

Set `LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE` to a JSON map. It is only applied when you do not pass an explicit `--provider` flag.

```bash
export LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE='{
  "default": "chatterbox",
  "non_english": "openai",
  "code_switch": "openai",
  "fil": "mms",
  "tl": "mms"
}'
```

How it resolves:

- Exact match first (for example `fil`).
- Language base match next (for example `fil-PH` -> `fil`).
- `code_switch` for mixed language tags like `en+fil` or `en,fil`.
- `non_english` fallback for non-English language tags.
- `default` otherwise.

This keeps product behavior generic while allowing personal language preferences.

## Personal Local Tagalog Path (MMS)

The new `mms` provider calls a local HTTP service at `http://127.0.0.1:8001/v1/audio/speech`.

Start local MMS TTS:

```bash
MMS_MODEL=facebook/mms-tts-tgl \
  /private/tmp/lvstudio-chatterbox-venv/bin/python scripts/mms_tts_server.py
```

Health check:

```bash
curl -sS http://127.0.0.1:8001/health
```

If you want Tagalog routed locally:

```bash
export LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE='{"default":"chatterbox","fil":"mms","tl":"mms","non_english":"openai","code_switch":"openai"}'
```

## Visual Consistency

Plans can now include a `visualBible` object:

- `stylePreset`
- `lookAndFeel`
- `palette`
- `eraAndLocation`
- `characterAnchors`
- `characters` (structured identity anchors)
- `locations` (structured setting anchors)
- `objects` (structured prop anchors)
- `continuityRules`
- `negativePrompt`

Studio planner generation now asks for this object and injects it into beat image prompts and notes to reduce jarring character/style drift.
