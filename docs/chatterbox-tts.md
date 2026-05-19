# Chatterbox TTS

Chatterbox should run outside Docker on Apple Silicon unless testing proves a container is faster. The TypeScript app calls it through an HTTP provider, so the model runtime can be host Python, a local FastAPI wrapper, or a remote GPU service.

## Recommended Apple Silicon Setup

Run a Chatterbox-compatible server on the host and point Local Video Studio at it:

```bash
CHATTERBOX_MODEL_CACHE=/private/tmp/lvstudio-hf \
  /private/tmp/lvstudio-chatterbox-venv/bin/python scripts/chatterbox_tts_server.py

export CHATTERBOX_TTS_URL=http://127.0.0.1:8000/v1/audio/speech
export CHATTERBOX_TTS_MODEL=chatterbox
export CHATTERBOX_AUDIO_PROMPT_PATH=/absolute/path/to/voice-reference.wav
export CHATTERBOX_EXAGGERATION=0.7
export CHATTERBOX_CFG_WEIGHT=0.3
```

For offline runs after the model is already cached:

```bash
CHATTERBOX_OFFLINE=1 \
CHATTERBOX_MODEL_CACHE=/private/tmp/lvstudio-hf \
  /private/tmp/lvstudio-chatterbox-venv/bin/python scripts/chatterbox_tts_server.py
```

## Cost-Conscious Provider Routing

For a single-user setup on a MacBook Air M4, prefer your laptop as the primary TTS machine. A normal VPS is useful for Studio orchestration, storage, and long-running Node/Remotion work, but it is usually not the best place to run Chatterbox unless it has a GPU or strong CPU allocation.

Use local-first mode when you want zero per-generation TTS cost:

```bash
export LVSTUDIO_TTS_MODE=local
```

Use API-only mode when you want predictable availability and accept per-generation spend:

```bash
export LVSTUDIO_TTS_MODE=api
export LVSTUDIO_TTS_FALLBACK_PROVIDER=openai
```

Use auto mode only when you explicitly allow fallback spend. It uses local Chatterbox when healthy, then falls back to the configured provider:

```bash
export LVSTUDIO_TTS_MODE=auto
export LVSTUDIO_TTS_FALLBACK_PROVIDER=openai
```

Then set the project plan to use Chatterbox:

```json
{
  "providers": {
    "tts": "chatterbox"
  },
  "voice": {
    "provider": "chatterbox",
    "voiceId": "clone",
    "format": "wav",
    "options": {
      "language": "en"
    }
  }
}
```

Generate one beat first:

```bash
pnpm lvstudio generate:tts demo --provider chatterbox --only-beat the-discovery-001 --force
```

## Quality Defaults

For suspense/story narration, start with:

- `CHATTERBOX_AUDIO_PROMPT_PATH`: 8-12 seconds of clean voice reference, same language and speaking style.
- `CHATTERBOX_EXAGGERATION=0.7`: more expressive delivery.
- `CHATTERBOX_CFG_WEIGHT=0.3`: often slows pacing back down when exaggeration is higher.
- `format: "wav"`: best intermediate quality before rendering/export compression.

If delivery becomes unstable, lower `CHATTERBOX_EXAGGERATION` toward `0.5` and remove any paralinguistic tags from the narration text.

## Docker Guidance

Do not put Chatterbox inference in the main studio image on Apple Silicon. Docker is still useful for the Node/Remotion runtime later, but Chatterbox should stay behind `CHATTERBOX_TTS_URL` so it can use the fastest local or remote backend available.
