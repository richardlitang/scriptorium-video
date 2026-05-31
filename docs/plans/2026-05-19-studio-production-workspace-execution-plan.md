# Studio Production Workspace Execution Plan

## Goal

Turn Studio from a script-running dashboard into a beat-based production workspace where users can queue long work, review each beat, lock what works, regenerate only affected pieces, and get clear completion/failure feedback.

## Product Direction

The app should feel like a calm production desk, not a generic AI prompt form and not a full traditional video editor. The core primitive is the beat: each beat combines narration, voice direction, timing, captions, visual intent, generated assets, and review status.

The app should keep the pipeline mechanics in the background. Users should see creative stages and artifact states:

- `Script`: source text and plan generation.
- `Plan`: sections and beats.
- `Voice`: narrator identity, direction, pauses, and audio assets.
- `Visuals`: thumbnails, prompts, versions, and locks.
- `Render`: queued jobs, completed drafts, stale renders, and exports.

## Architecture Overview

Reuse the current project model instead of introducing a separate editor database. `video-plan.json`, `asset-manifest.json`, `timeline.json`, `captions/captions.json`, and `.studio-data/run-state` remain the source of truth.

Add UI and endpoints in thin layers:

- Studio server owns jobs, asset status changes, and scoped regenerate commands.
- Core continues to own timeline sync, TTS, captions, and render bundle semantics.
- Browser UI renders a production workspace over existing project artifacts.

## Existing Primitives To Reuse

- Beat data: `packages/core/src/schemas/video-plan.schema.ts`
- Asset status: `ArtifactStatusSchema`, including `locked_by_user`
- Timing lock: `BeatTimingIntentSchema.locked`
- Voice direction: `beat.voiceDirection`
- Background job state: `.studio-data/run-state/<project>.json`
- Project details endpoint: `GET /api/projects/:id`
- Asset list endpoint: `GET /api/projects/:id/assets`
- Image generation endpoint: `POST /api/projects/:id/generate-images`
- Audio regeneration flow: `POST /api/projects/:id/prepare-draft`
- Draft job flow: `POST /api/projects/:id/draft-job`

## Non-Goals For This Phase

- No full NLE track editor.
- No manual clip dragging.
- No frame-accurate waveform editor.
- No full Draft 1 vs Draft 2 project history system.
- No server restart recovery for in-memory active jobs beyond marking stale jobs as stopped.
- No LLM taste review until deterministic review checks exist.

## Data Model Rules

Every user action must target one of these scopes:

- `project`
- `section`
- `beat`
- `asset`
- `render`

If a proposed action does not clearly fit one scope, defer it until the model is clearer.

## Slice 1: Job Center

**Goal:** Make background work visible, persistent, and calm.

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`
- Add test if practical: `apps/studio/test/job-state.test.mjs`

**Changes:**

- Promote the current draft-job banner into a compact Job Center panel.
- Show current and recent jobs from run state and quality history.
- Display phase, current section, completed/total, retry attempt, started time, finished time, and error.
- Add actions:
  - `View Output`
  - `Retry Failed Step` if the job failed and a scoped resume is possible
  - `Dismiss`
- Keep `Make Draft` disabled only while the selected project has a queued/running draft job.

**Acceptance Criteria:**

- Closing and reopening the browser tab still shows an active draft job if Studio server is still running.
- A completed job shows a banner and remains visible in Job Center.
- A failed job shows an actionable error, not raw stack-only output.
- Stale queued/running jobs after Studio restart are shown as stopped.

**Verify:**

```bash
pnpm -s build
node --check apps/studio/server.mjs
node --check apps/studio/public/app.js
curl -s http://localhost:4173/api/projects/doc-demo/draft-job
```

**Commit:** `feat(studio): add persistent job center`

## Slice 2: Beat Timeline

**Goal:** Make sections and beats the main navigational surface.

**Files:**

- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`

**Changes:**

- Add a `beat-timeline` region below the video preview or between input and preview.
- Render sections as grouped lanes.
- Render each beat as a compact card with:
  - beat order
  - short narration excerpt
  - duration
  - selected state
  - image status
  - audio status
  - caption status
  - lock indicators
  - stale render marker if current render hashes differ from plan/timeline
- Clicking a beat selects it and opens the Beat Inspector.

**Status Derivation:**

- Image present: `asset.role === "primary_visual"` for beat.
- Audio present: `asset.role === "voiceover"` for beat.
- Locked: `asset.status === "locked_by_user"` or `beat.timing.locked`.
- Caption present: caption segment overlaps beat timeline segment.
- Stale render: `runState.lastRenderPlanHash !== runState.currentPlanHash` or `runState.lastRenderTimelineHash !== runState.currentTimelineHash`.

**Acceptance Criteria:**

- User can select any beat without opening JSON.
- Missing assets are visible at a glance.
- Existing projects with no timeline do not crash the UI.
- Mobile layout remains usable.

**Verify:**

```bash
pnpm -s build
node --check apps/studio/public/app.js
```

**Commit:** `feat(studio): add beat timeline workspace`

## Slice 3: Beat Inspector

**Goal:** Give users a focused editor for one beat at a time.

**Files:**

- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`
- Modify if needed: `apps/studio/server.mjs`

**Changes:**

- Add a right-side or lower `beat-inspector` panel.
- Tabs:
  - `Script`
  - `Voice`
  - `Visual`
  - `Captions`
  - `Timing`
- The initial tab should follow the clicked element:
  - beat card body -> `Script`
  - voice chip -> `Voice`
  - thumbnail -> `Visual`
  - caption status -> `Captions`
  - duration -> `Timing`
- Start read/write with plan editor JSON as backing state, then save through existing `PUT /api/projects/:id/plan`.

**Fields:**

- `Script`: narration text.
- `Voice`: profile, intensity, pause before, pause after, emphasis.
- `Visual`: current image, prompt, regenerate button.
- `Captions`: emphasis phrases and caption style.
- `Timing`: estimated duration, preferred min/max, media policy, timing locked.

**Acceptance Criteria:**

- Editing a beat updates `planEditor` and marks plan unsaved.
- Saving plan persists beat edits and syncs timeline.
- Inspector never shows raw JSON as the primary editing surface.

**Verify:**

```bash
pnpm -s build
node --check apps/studio/public/app.js
```

**Commit:** `feat(studio): add beat inspector`

## Slice 4: Asset Locking

**Goal:** Let users preserve good generated work while regenerating weak pieces.

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`
- Add test if practical: `apps/studio/test/asset-locking.test.mjs`

**Server Changes:**

- Add endpoint: `PATCH /api/projects/:id/assets/:assetId`
- Body:

```json
{
  "status": "locked_by_user"
}
```

- Allowed status transitions:
  - `generated` -> `locked_by_user`
  - `edited` -> `locked_by_user`
  - `locked_by_user` -> `generated`
  - `stale` -> `locked_by_user`
- Preserve asset path and source metadata.
- Run `sync` after status update.

**UI Changes:**

- Add lock/unlock button on media cards and beat timeline status chips.
- Show locked assets as protected.
- Explain lock effect in tooltip: locked assets are skipped by non-force regeneration.

**Acceptance Criteria:**

- User can lock a generated image.
- User can unlock it.
- Locked TTS assets are already respected by `generateTTSForProject` when not forced.
- Image regeneration logic must be updated before relying on lock protection for images.

**Verify:**

```bash
pnpm -s build
node --check apps/studio/server.mjs
node --check apps/studio/public/app.js
```

**Commit:** `feat(studio): add asset locking controls`

## Slice 5: Regenerate Affected

**Goal:** Regenerate only the selected beat or section, and skip locked artifacts.

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/public/app.js`
- Modify: `packages/core/src/generate-tts.ts` only if force behavior needs refinement
- Modify image generation logic in `apps/studio/server.mjs`

**Endpoints:**

- Add: `POST /api/projects/:id/beats/:beatId/regenerate`
- Body:

```json
{
  "audio": true,
  "image": true,
  "captions": true,
  "render": false,
  "force": false
}
```

- Add later if needed: `POST /api/projects/:id/sections/:sectionId/regenerate`

**Behavior:**

- Audio:
  - run `generate:tts --only-beat <beatId>`
  - do not pass `--force` unless user explicitly chooses override
- Image:
  - selected image generation should skip locked image assets unless `force`
- Captions:
  - run sync/transcribe/captions after audio changes
- Render:
  - leave render stale unless user checks render now

**Acceptance Criteria:**

- Selected beat image can be regenerated without touching other beats.
- Selected beat audio can be regenerated without touching other beats.
- Locked assets are skipped unless force is explicitly requested.
- Timeline updates magnetically after changed audio duration.

**Verify:**

```bash
pnpm -s build
node --check apps/studio/server.mjs
node --check apps/studio/public/app.js
```

**Commit:** `feat(studio): regenerate selected beat assets`

## Slice 6: Voice Controls Abstraction

**Goal:** Replace raw Chatterbox-first controls with director-friendly controls.

**Files:**

- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`
- Modify: `apps/studio/voice-settings.mjs`
- Modify: `apps/studio/test/voice-settings.test.mjs`
- Reuse: `packages/core/src/voice-direction.ts`

**Changes:**

- Split UI into:
  - `Narrator Identity`
  - `Performance Direction`
  - `Advanced Chatterbox`
- Primary controls:
  - delivery profile
  - intensity
  - stability
  - pacing
  - variation
- Keep raw controls available under Advanced:
  - exaggeration
  - cfg weight
  - temperature
  - seed
- Map semantic controls to provider options using the same profile resolver concepts as core.

**Acceptance Criteria:**

- Users can choose meaningful performance controls without understanding Chatterbox internals.
- Existing saved settings continue to load.
- Advanced settings still work for debugging.

**Verify:**

```bash
pnpm -s build
node --test apps/studio/test/voice-settings.test.mjs
```

**Commit:** `feat(studio): simplify voice direction controls`

## Slice 7: Deterministic Review Mode

**Goal:** Flag concrete production issues before any LLM taste review.

**Files:**

- Add: `packages/core/src/review-project.ts`
- Add: `packages/core/test/review-project.test.mjs`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`

**Checks:**

- Missing primary visual per beat.
- Missing voiceover per beat.
- Captions with too few words, for example 1-2 word fragments.
- Captions with too many characters for vertical video.
- Beat duration outside preferred min/max.
- Render stale compared with current plan/timeline hash.
- Failed or stale assets in manifest.
- Voice asset missing audio processing metadata.
- Optional later: loudness check when ffmpeg loudnorm summary is available.

**CLI:**

```bash
pnpm lvstudio review <project-id>
```

**Studio Endpoint:**

```http
GET /api/projects/:id/review
```

**Acceptance Criteria:**

- Review panel lists actionable issues by severity.
- Clicking a review issue selects the relevant beat or asset.
- No vague “make it better” feedback in deterministic review.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/review-project.test.mjs
pnpm lvstudio review doc-demo
```

**Commit:** `feat(review): add deterministic project review`

## Slice 8: Review-Guided Workspace

**Goal:** Turn the deterministic review into the main improvement loop.

**Files:**

- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`

**Changes:**

- Add a `Review` panel with filters:
  - `Critical`
  - `Warnings`
  - `Suggestions`
- Add issue actions:
  - select beat
  - regenerate affected
  - lock asset
  - mark reviewed
- Show review issue counts on beat cards.

**Acceptance Criteria:**

- User can move from a completed draft to the weakest beat in one click.
- Fixing a beat clears or updates relevant deterministic issues after rerun.

**Verify:**

```bash
pnpm -s build
node --check apps/studio/public/app.js
```

**Commit:** `feat(studio): add review-guided editing loop`

## Implementation Order

1. Job Center
2. Beat Timeline
3. Beat Inspector
4. Asset Locking
5. Regenerate Affected
6. Voice Controls Abstraction
7. Deterministic Review Mode
8. Review-Guided Workspace

## Cross-Slice UX Constraints

- Do not expose pipeline internals as primary actions.
- Keep logs in advanced/debug views.
- Prefer one obvious next action over many equal buttons.
- Use beat cards and inspector tabs instead of asking users to edit JSON.
- Show stale state clearly whenever plan/timeline/assets differ from rendered output.
- Make background work visible without blocking editing.

## Verification Baseline For Every Slice

Run these before each commit:

```bash
pnpm -s build
node --check apps/studio/server.mjs
node --check apps/studio/public/app.js
```

Run targeted tests when touched modules have tests:

```bash
node --test apps/studio/test/voice-settings.test.mjs packages/core/test/audio-processing.test.mjs packages/core/test/direct-voice.test.mjs packages/core/test/voice-direction.test.mjs
```

## Open Decisions

- Whether Job Center should show all projects or only selected project first.
- Whether beat timeline belongs below preview or between script and preview.
- Whether asset lock state should remain only `asset.status` or add a dedicated lock object later.
- Whether caption grouping edits should be persisted in captions output or plan intent first.
- Whether review “mark reviewed” should persist in `.studio-data` or plan metadata.

## Recommended First Build

Start with Slice 1 and Slice 2 in separate commits. They create the workspace skeleton and reduce wait anxiety without changing core generation behavior.
