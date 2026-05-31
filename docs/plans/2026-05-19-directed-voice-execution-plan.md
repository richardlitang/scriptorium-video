# Feature: Directed Voice and Audio Execution Plan

## Goal

Make generated video narration sound intentionally directed per beat, consistently loud enough for phone playback, and ready for later sound cue mixing without reworking the renderer from scratch.

## Architecture Overview

The project already generates one voiceover asset per beat, so the right implementation path is to enrich beat metadata and improve the existing audio pipeline. The LLM should assign provider-neutral creative direction, while deterministic code maps that direction to TTS provider options, post-processing, timeline timing, and renderer cues.

## Tech Stack

- TypeScript core packages with Zod schemas.
- Existing TTS provider abstraction in `packages/core/src/tts-provider.ts`.
- Chatterbox provider in `packages/providers/src/tts/chatterbox-tts-provider.ts`.
- `ffmpeg`/`ffprobe` for audio post-processing and verification.
- Remotion `<Audio>` scheduling for final rendering.
- Studio server endpoints in `apps/studio/server.mjs`.

## Phase 1: Fix Loudness First

This is the highest-return slice. It improves current output even before LLM direction exists.

### Task 1: Add audio processing metadata schema

**Files:**

- Modify: `packages/core/src/schemas/asset-manifest.schema.ts`

**Action:**

Add a typed optional audio processing object to asset source metadata:

```ts
audioProcessing: z.object({
  loudnessTargetLufs: z.number(),
  truePeakDb: z.number(),
  compression: z.string(),
  processedAt: z.string().datetime(),
}).optional();
```

Keep existing assets valid by making the field optional.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(audio): add processing metadata to asset manifest`

---

### Task 2: Add voiceover normalization helper

**Files:**

- Create: `packages/core/src/audio-processing.ts`
- Modify: `packages/core/src/index.ts`

**Action:**

Create a helper that normalizes/compresses one audio file in place:

```ts
export type VoiceProcessingOptions = {
  loudnessTargetLufs?: number;
  truePeakDb?: number;
  lra?: number;
};

export async function normalizeVoiceover(
  audioPath: string,
  options: VoiceProcessingOptions = {},
): Promise<{ loudnessTargetLufs: number; truePeakDb: number; compression: string }> {
  // Run ffmpeg against a temporary output path, then replace original on success.
}
```

Use defaults:

- `loudnessTargetLufs = -16`
- `truePeakDb = -3`
- `lra = 11`
- compression preset: `light_voice`

Use `execFile`, not shell string interpolation.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(audio): add voiceover normalization helper`

---

### Task 3: Add normalization unit coverage

**Files:**

- Create: `packages/core/test/audio-processing.test.mjs`

**Action:**

Test command safety and failure behavior around missing `ffmpeg` inputs. If testing actual audio is too slow, test that the helper rejects cleanly for missing files and never leaves a temporary output path behind.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/audio-processing.test.mjs
```

**Commit:** `test(audio): cover voiceover normalization failures`

---

### Task 4: Run normalization after TTS generation

**Files:**

- Modify: `packages/core/src/generate-tts.ts`

**Action:**

After `provider.synthesize(...)` succeeds:

1. Run `normalizeVoiceover(absolutePath)`.
2. Re-run `probeMedia(absolutePath)`.
3. Store the updated duration.
4. Add `source.audioProcessing` metadata.

Keep behavior unchanged for `providerId === "manual"` unless we explicitly decide manual assets should also be processed.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio generate:tts demo --provider mock --only-beat intro-001 --force --no-cache
```

**Commit:** `feat(audio): normalize generated voiceover assets`

---

### Task 5: Add a loudness verification command or script

**Files:**

- Create: `scripts/check_voice_loudness.sh`

**Action:**

Create a small script that runs `ffmpeg` loudness analysis for an input audio/video file. It should be useful during QA, not part of runtime.

**Verify:**

```bash
bash scripts/check_voice_loudness.sh content/projects/demo/assets/audio/voice/<file>.wav
```

**Commit:** `chore(audio): add loudness check helper`

## Phase 2: Add Provider-Neutral Voice Direction

### Task 6: Extend beat schema with voice direction

**Files:**

- Modify: `packages/core/src/schemas/video-plan.schema.ts`

**Action:**

Add:

```ts
export const VoiceProfileSchema = z.enum([
  "neutral",
  "warm_open",
  "clear_explainer",
  "authoritative",
  "energetic",
  "key_point",
  "reflective",
  "tense",
  "reveal",
  "urgent",
  "soft_close",
]);

export const VoiceDirectionSchema = z
  .object({
    profile: VoiceProfileSchema.default("neutral"),
    deliveryNote: z.string().optional(),
    emphasis: z.array(z.string()).default([]),
    pauseBeforeSeconds: z.number().min(0).max(1.2).default(0),
    pauseAfterSeconds: z.number().min(0).max(1.2).default(0),
    intensity: z.number().min(0).max(1).default(0.5),
    source: z.enum(["user", "llm", "default"]).default("default"),
  })
  .strict();
```

Add `voiceDirection: VoiceDirectionSchema.optional()` to `BeatSchema`.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio validate demo
```

**Commit:** `feat(audio): add beat voice direction schema`

---

### Task 7: Extend TTS request contract

**Files:**

- Modify: `packages/core/src/tts-provider.ts`

**Action:**

Add:

```ts
delivery?: {
  profile?: string;
  intensity?: number;
  deliveryNote?: string;
  emphasis?: string[];
};
providerOptions?: Record<string, unknown>;
```

Keep `options` intact for compatibility.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(tts): allow beat-level delivery options`

---

### Task 8: Add voice profile resolver

**Files:**

- Create: `packages/core/src/voice-direction.ts`
- Modify: `packages/core/src/index.ts`

**Action:**

Create:

```ts
export function resolveVoiceDirection(beat, plan) {
  // Return provider-neutral delivery and providerOptions.
}
```

For Chatterbox, map profiles to:

- `exaggeration`
- `cfg_weight`
- `temperature`

Do not read environment variables here. Global Studio voice settings remain runtime fallback at the provider layer.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(audio): resolve voice profiles to provider options`

---

### Task 9: Add resolver tests

**Files:**

- Create: `packages/core/test/voice-direction.test.mjs`

**Action:**

Test:

- Missing `voiceDirection` returns neutral/default delivery.
- `key_point` resolves stable Chatterbox options.
- Pause values remain clamped by schema.
- Returned object is provider-neutral plus provider options.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/voice-direction.test.mjs
```

**Commit:** `test(audio): cover voice profile resolution`

---

### Task 10: Pass resolved direction into TTS generation

**Files:**

- Modify: `packages/core/src/generate-tts.ts`

**Action:**

Before calling `provider.synthesize`, resolve the beat direction and pass:

- `delivery`
- `providerOptions`

Include resolved direction in `cacheKey(...)`.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/voice-direction.test.mjs
```

**Commit:** `feat(tts): pass beat voice direction to providers`

---

### Task 11: Make Chatterbox consume request provider options

**Files:**

- Modify: `packages/providers/src/tts/chatterbox-tts-provider.ts`
- Modify: `packages/providers/test/chatterbox-tts-provider.test.mjs`

**Action:**

Update `buildPayload` so request-level `providerOptions` override environment fallback for:

- `audio_prompt_path`
- `exaggeration`
- `cfg_weight`
- `temperature`
- `seed`

Keep env fallback for global Studio settings.

**Verify:**

```bash
pnpm -s build
node --test packages/providers/test/chatterbox-tts-provider.test.mjs
```

**Commit:** `feat(chatterbox): honor beat-level provider options`

## Phase 3: LLM Voice Director

### Task 12: Define voice director output schema

**Files:**

- Create: `packages/core/src/schemas/voice-director.schema.ts`
- Modify: `packages/core/src/index.ts`

**Action:**

Define a strict schema for LLM output:

- `beatId`
- `voiceDirection`
- optional `captionEmphasis`
- optional `sfxCues`

The schema must reject unknown profiles and clamp pauses through the existing `VoiceDirectionSchema`.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(audio): add voice director output schema`

---

### Task 13: Add core direct voice module

**Files:**

- Create: `packages/core/src/direct-voice.ts`

**Action:**

Create a pure function:

```ts
export function applyVoiceDirectionPlan(videoPlan, directionOutput, options);
```

Behavior:

- Match entries by `beatId`.
- Set `beat.voiceDirection`.
- Merge `caption.emphasis`.
- Preserve user-sourced `voiceDirection` unless `force` is true.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(audio): apply directed voice output to plan`

---

### Task 14: Add direct voice tests

**Files:**

- Create: `packages/core/test/direct-voice.test.mjs`

**Action:**

Test:

- Applies LLM direction to matching beat.
- Does not overwrite `source: "user"` direction without `force`.
- Merges emphasis without duplicates.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/direct-voice.test.mjs
```

**Commit:** `test(audio): cover applying voice direction`

---

### Task 15: Add CLI command skeleton

**Files:**

- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/direct-voice.ts`

**Action:**

Add:

```bash
pnpm lvstudio direct:voice <project-id>
```

Initial version can support `--from-file <json>` so we can test plan application without calling an LLM yet.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio direct:voice demo --from-file /tmp/direction.json
```

**Commit:** `feat(cli): add direct voice command`

---

### Task 16: Add LLM-backed voice direction

**Files:**

- Modify: `packages/cli/src/direct-voice.ts`
- Possibly add: `packages/core/src/voice-director-prompt.ts`

**Action:**

Use existing OpenAI configuration patterns from Studio/server code if they are moved into a shared helper. Request strict JSON matching `voice-director.schema.ts`.

Prompt requirements:

- Choose only allowed profiles.
- Do not output raw provider settings.
- Use short delivery notes.
- Clamp pauses.
- Mark output source as `llm`.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio direct:voice demo --provider openai
pnpm lvstudio validate demo
```

**Commit:** `feat(audio): generate voice direction with llm`

## Phase 4: Pause-Aware Audio

### Task 17: Add pause padding helper

**Files:**

- Modify: `packages/core/src/audio-processing.ts`
- Add tests in: `packages/core/test/audio-processing.test.mjs`

**Action:**

Add helper to pad an audio file with silence before/after using `ffmpeg`.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/audio-processing.test.mjs
```

**Commit:** `feat(audio): add pause padding helper`

---

### Task 18: Apply beat pauses after TTS

**Files:**

- Modify: `packages/core/src/generate-tts.ts`

**Action:**

After TTS and before normalization:

1. Read resolved `pauseBeforeSeconds` and `pauseAfterSeconds`.
2. Pad the generated file.
3. Normalize/compress.
4. Re-probe final duration.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio generate:tts demo --provider mock --only-beat intro-001 --force --no-cache
pnpm lvstudio sync demo
```

**Commit:** `feat(audio): apply voice direction pauses to assets`

## Phase 5: Sound Cue Scheduling

### Task 19: Add cue schemas

**Files:**

- Modify: `packages/core/src/schemas/video-plan.schema.ts`
- Modify: `packages/core/src/schemas/timeline.schema.ts`

**Action:**

Add `sfxCues` intent to beats and `audioCues` timing to timeline segments or the timeline root.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio validate demo
```

**Commit:** `feat(audio): add sound cue schemas`

---

### Task 20: Resolve cues during sync

**Files:**

- Modify: `packages/core/src/sync-project.ts`

**Action:**

Map beat `sfxCues` to existing `sfx`/`music` assets and write absolute cue timing into `timeline.json`.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio sync demo
```

**Commit:** `feat(audio): schedule sound cues in timeline`

---

### Task 21: Render scheduled cues

**Files:**

- Modify: `apps/renderer/src/templates/VerticalStoryTemplate.tsx`
- Modify: `apps/renderer/src/templates/DocumentaryLongformTemplate.tsx`

**Action:**

Render each scheduled cue with Remotion `<Audio>`, converting `levelDb` to linear volume.

**Verify:**

```bash
pnpm -s build
pnpm lvstudio render demo --quality draft --force
```

**Commit:** `feat(renderer): mix scheduled sound cues`

## Phase 6: Studio UX

### Task 22: Add Direct Voice button

**Files:**

- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/server.mjs`

**Action:**

Add a `Direct Voice` button near `Regenerate Audio`. Server endpoint runs `pnpm lvstudio direct:voice <project-id>`.

**Verify:**

```bash
pnpm -s build
pnpm studio
```

**Commit:** `feat(studio): add direct voice action`

---

### Task 23: Show and override voice profiles per beat

**Files:**

- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/styles.css`

**Action:**

In the beat/media refinement cards, show current voice profile and allow dropdown override. Saving updates `video-plan.json`.

**Verify:**

```bash
pnpm -s build
pnpm studio
```

**Commit:** `feat(studio): allow per-beat voice profile overrides`

## Checkpoints

1. After Phase 1: listen to one regenerated draft and confirm loudness is materially better.
2. After Phase 2: inspect `asset-manifest.json` and confirm cache keys change when profile changes.
3. After Phase 3: inspect `video-plan.json` and confirm `Direct Voice` produces sensible, bounded direction.
4. After Phase 4: confirm reveal/key-point pauses change rendered timing.
5. After Phase 5: confirm SFX/music cues render at conservative levels.
6. After Phase 6: verify Studio workflow is understandable without opening Advanced.

## Recommended Execution Order

Start with Phase 1 only. Loudness is the current hard quality bug and does not depend on LLM behavior. Then ship Phase 2 so the data model and provider boundary are correct. Only after those are stable should we add the LLM Director, because it depends on the schema and resolver being deterministic.
