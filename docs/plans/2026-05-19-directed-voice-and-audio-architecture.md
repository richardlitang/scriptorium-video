# Directed Voice and Audio Architecture

## Problem

Short suspense videos need the audio track to perform the story, not just read it. Current output is understandable but too even: the narrator stays close to one delivery style, reveal beats do not get enough pause or emphasis, and generated voice files can be too quiet for phone playback. The result is that scary moments feel explained rather than staged.

The goal is to add controlled voice direction, timing, loudness, and sound cues without rebuilding the whole render pipeline.

## Current Architecture

### Plan Shape

`video-plan.json` is the source of narrative structure. Each section has beats, and each beat has:

- `narration`: the text sent to TTS.
- `timing`: estimated duration and media policy.
- `media`: visual intent.
- `caption`: emphasis words and caption style.
- `emotion`: optional freeform string.
- `notes`: optional freeform notes.

Voice settings are mostly global under `voice.options`, with fields such as `speed`, `emotion`, and `language`. Chatterbox-specific controls currently live outside the plan in Studio voice settings and become environment variables:

- `CHATTERBOX_AUDIO_PROMPT_PATH`
- `CHATTERBOX_EXAGGERATION`
- `CHATTERBOX_CFG_WEIGHT`
- `CHATTERBOX_TEMPERATURE`
- `CHATTERBOX_SEED`

### TTS Generation

`packages/core/src/generate-tts.ts` generates one voiceover asset per beat. For each selected beat it sends:

- `beat.narration`
- `plan.voice.voiceId`
- `plan.voice.format`
- `plan.voice.options`

Generated voice assets are written to `assets/audio/voice/` and recorded in `asset-manifest.json` as `role: "voiceover"`.

The cache key includes provider id, beat id, narration, voice id, format, and global voice options. It does not include beat-level voice direction because that does not exist yet.

### Chatterbox Provider

`packages/providers/src/tts/chatterbox-tts-provider.ts` builds a Chatterbox-compatible request. It reads most expressive controls from environment variables, not from beat metadata:

- `exaggeration`
- `cfg_weight`
- `temperature`
- `seed`
- `audio_prompt_path`

The local Python server in `scripts/chatterbox_tts_server.py` passes those values into `model.generate()` when supported. It does not currently normalize loudness, compress voiceover, add pauses, or mix sound effects.

### Prepare Audio Flow

Studio's `prepare-draft` endpoint runs:

1. `generate:tts`
2. `sync`
3. `transcribe`
4. `captions`
5. `check`

This is the correct place to regenerate narration after voice settings change.

### Timeline and Rendering

`packages/core/src/sync-project.ts` builds `timeline.json` from beat order and voiceover durations. If a voice asset exists, the beat duration follows the audio file duration.

`apps/renderer/src/templates/VerticalStoryTemplate.tsx` renders visuals and schedules each beat's voiceover with Remotion `<Audio>`. The renderer does not currently schedule `sfx` or `music` assets, even though the asset schema already supports `role: "sfx"` and `role: "music"`.

### Captions

`packages/core/src/generate-captions.ts` generates captions from transcript words and timeline segments. It now groups short suspense sentences more naturally, but caption emphasis is still visual metadata only. It does not change TTS emphasis.

## What This Means

The system is already chopped at the right level for narration: one audio file per beat. We do not need to chop rendered video manually or rewrite Remotion. We need to enrich beats with explicit voice direction and make the audio pipeline respect it.

The main missing layer is a durable "voice direction" artifact inside the plan.

## Proposed Architecture

### 1. Add Voice Direction To Beats

Extend `BeatSchema` with a structured `voiceDirection` object:

```json
{
  "voiceDirection": {
    "profile": "reveal",
    "deliveryNote": "Lower, slower, controlled dread. Do not overact.",
    "emphasis": ["inside her locked closet"],
    "pauseBeforeSeconds": 0.35,
    "pauseAfterSeconds": 0.8,
    "intensity": 0.75
  }
}
```

Initial profile set:

- `calm_open`
- `uneasy`
- `suspense`
- `tense`
- `reveal`
- `cold_final`
- `whisper`
- `urgent`

Do not let arbitrary raw model settings spread through the plan. Profiles should map to known-good provider settings in code.

### 2. Add A Voice Director Step

Add a new command:

```bash
pnpm lvstudio direct:voice <project-id>
```

Responsibilities:

- Read the current `video-plan.json`.
- Ask the LLM to assign `voiceDirection` per beat.
- Fill `caption.emphasis` with money phrases.
- Suggest sound cue intents for key beats.
- Preserve user edits and existing locked fields.

The LLM should choose profiles, pauses, emphasis, and delivery notes. It should not choose raw `temperature`, `cfgWeight`, or `exaggeration` values directly.

Example LLM output for a reveal beat:

```json
{
  "beatId": "closet-phone-003",
  "voiceDirection": {
    "profile": "reveal",
    "deliveryNote": "Drop quieter and slower. Let the location land.",
    "emphasis": ["inside her locked closet"],
    "pauseBeforeSeconds": 0.25,
    "pauseAfterSeconds": 0.8,
    "intensity": 0.85
  },
  "sfxCues": [
    {
      "id": "closet-phone-ring",
      "type": "phone_ring",
      "start": "after_line",
      "levelDb": -12
    }
  ]
}
```

### 3. Map Voice Profiles To Provider Settings

Add a provider-neutral resolver in core, for example:

```ts
resolveVoiceProfile(profile, globalVoiceSettings)
```

For Chatterbox, profile mapping could start as:

| Profile | Exaggeration | CFG Weight | Temperature | Intent |
| --- | ---: | ---: | ---: | --- |
| `calm_open` | 0.45 | 0.45 | 0.60 | controlled, plainspoken |
| `uneasy` | 0.52 | 0.38 | 0.70 | slight tension |
| `suspense` | 0.58 | 0.35 | 0.75 | intimate dread |
| `tense` | 0.65 | 0.32 | 0.78 | tighter, more urgent |
| `reveal` | 0.62 | 0.30 | 0.72 | slower, heavier reveal |
| `cold_final` | 0.50 | 0.34 | 0.65 | restrained and unsettling |
| `whisper` | 0.42 | 0.30 | 0.62 | quiet, close, controlled |
| `urgent` | 0.72 | 0.36 | 0.82 | higher energy |

`generate-tts.ts` should pass resolved beat-level options to the provider. The cache key must include the resolved profile settings, pauses, and delivery text so regenerating audio is deterministic.

### 4. Make Pauses Explicit

Pauses should be represented in timing, not hidden in punctuation alone.

Recommended first implementation:

- Add `pauseBeforeSeconds` and `pauseAfterSeconds` to `voiceDirection`.
- During sync, add those pauses to segment timing.
- During render, either include silence in generated audio or offset the `<Audio>` inside a longer beat segment.

Preferred near-term path: post-process each generated voiceover into a final beat audio file with silence padded before/after. Then the existing timeline can continue using voice asset duration.

### 5. Normalize And Compress Voiceover

Add a post-processing step after each TTS file is generated:

```bash
ffmpeg -i input.wav \
  -af "loudnorm=I=-16:TP=-3:LRA=11,acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120" \
  output.normalized.wav
```

Implementation options:

- Replace generated file in place after provider synthesis.
- Or create a separate `processedPath` asset field later.

Start simple: process in place and re-probe duration. Store metadata in `asset.source`, such as:

```json
{
  "audioProcessing": {
    "loudnessTargetLufs": -16,
    "truePeakDb": -3,
    "compression": "light_voice"
  }
}
```

This should be the first implementation slice because it directly fixes quiet output.

### 6. Add Sound Cue Intents

Extend beat metadata with `sfxCues`:

```json
{
  "sfxCues": [
    {
      "id": "delivery-ping",
      "kind": "notification_ping",
      "placement": "beat_start",
      "offsetSeconds": 0.15,
      "levelDb": -13
    },
    {
      "id": "door-knock",
      "kind": "knock",
      "placement": "before_reveal",
      "offsetSeconds": 0,
      "levelDb": -9
    }
  ]
}
```

Initial cue library can be local/manual. Later it can generate or import assets.

Renderer work:

- Include `sfx` and `music` assets in `timeline.segments`.
- Schedule them in Remotion with `<Audio volume={...}>`.
- Keep low atmosphere/hum separate from voiceover so it can be mixed quietly under narration.

### 7. Studio UX

Near-term UI should stay simple:

- Add `Direct Voice` button near `Regenerate Audio`.
- Show selected profile per beat in the media/beat refinement panel.
- Let user override a beat profile from a dropdown.
- Keep global Voice Settings as the fallback/default.

Recommended user flow:

1. Generate or edit story plan.
2. Click `Direct Voice`.
3. Review/override profiles if needed.
4. Click `Regenerate Audio`.
5. Click `Render Draft Only`.

## Implementation Plan

### Slice 1: Audio Loudness Processing

Files:

- `packages/core/src/generate-tts.ts`
- `packages/core/src/media-probe.ts` if needed
- tests around command construction or generated metadata

Add post-TTS normalization/compression with `ffmpeg`. Re-probe duration after processing.

Verification:

- Generate one beat.
- Run `ffmpeg`/`ffprobe` loudness check.
- Confirm voice peaks and loudness are in a phone-friendly range.

### Slice 2: Schema For Voice Direction

Files:

- `packages/core/src/schemas/video-plan.schema.ts`
- `packages/core/src/generate-tts.ts`
- tests for cache key changes and defaults

Add `voiceDirection` to beats. Add resolver from profile to provider-level options. Keep fallback behavior identical when `voiceDirection` is absent.

### Slice 3: LLM Voice Director

Files:

- `packages/cli/src/index.ts`
- `apps/studio/server.mjs`
- likely a new core module, `packages/core/src/direct-voice.ts`

Add `direct:voice` command and Studio endpoint. The LLM writes structured profile assignments, emphasis, pauses, and cue intents into the existing plan.

### Slice 4: Pause-Aware Audio Assets

Files:

- `packages/core/src/generate-tts.ts`
- `packages/core/src/sync-project.ts`

Pad generated voice assets with beat-level pause-before and pause-after silence. Timeline then naturally reflects the final asset duration.

### Slice 5: SFX/Music Scheduling

Files:

- `packages/core/src/schemas/video-plan.schema.ts`
- `packages/core/src/sync-project.ts`
- `apps/renderer/src/templates/VerticalStoryTemplate.tsx`
- `apps/renderer/src/templates/DocumentaryLongformTemplate.tsx`

Add cue metadata, map cues to assets, and schedule `sfx`/`music` playback in Remotion.

## Risks And Tradeoffs

- Chatterbox may not reliably obey textual delivery notes. Profile settings and pauses are more dependable than prompt prose.
- Too many profiles will make tuning impossible. Start with a small fixed set.
- LLM-generated pauses can become melodramatic. Clamp pause ranges by profile, for example `0-1.2s`.
- Loudness normalization can reveal noise or artifacts in bad voice samples. Keep light compression and expose a bypass later if needed.
- Sound cues can quickly feel cheap. Start with a tiny curated cue set and conservative levels.

## Recommendation

Do this incrementally. The current architecture is close enough because audio already exists per beat and timeline sync already depends on voice asset duration.

Priority order:

1. Normalize/compress voiceover.
2. Add `voiceDirection` profiles on beats.
3. Add LLM `Direct Voice` to assign profiles, emphasis, and pauses.
4. Add pause padding to generated voice assets.
5. Add SFX/music cue scheduling.

This gives us controlled fear, better pacing, louder phone-ready audio, and stronger reveal beats without replacing the project model or renderer.
