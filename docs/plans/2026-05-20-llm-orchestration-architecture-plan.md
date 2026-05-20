# Feature: LLM Orchestration Architecture Plan

## Goal

Upgrade the existing TypeScript/Zod/Remotion video pipeline so LLMs produce creative intent and deterministic code executes, validates, repairs, and renders it with reliable progress reporting.

## Architecture Overview

Keep the current repo architecture: `apps/studio` coordinates long-running jobs and OpenAI calls, `packages/core` owns schemas and deterministic project transformations, `packages/quality` owns deterministic quality gates, and `apps/renderer` stays pure Remotion rendering. Do not introduce Python, Pydantic, MoviePy, BullMQ, or Inngest in this first implementation; the local-first product needs a durable in-repo job runner before external queue infrastructure.

The target flow is:

1. Primary planner LLM creates the nested `video-plan.json`.
2. Orchestrator LLM enriches beat-level TTS, visual coverage, caption, and edit intent.
3. Deterministic sync resolves assets into `timeline.json`.
4. Deterministic generators create images, TTS, transcript, and captions.
5. Deterministic quality gates produce structured findings.
6. Repair LLM proposes schema-valid plan patches with a circuit breaker.
7. Remotion renders from a deterministic render bundle.

## Tech Stack

- TypeScript and ESM across repo packages.
- Zod schemas as runtime contract in `packages/core/src/schemas`.
- OpenAI Responses structured outputs in `apps/studio/server.mjs`.
- Existing asset manifest and timeline model in `packages/core`.
- Existing Remotion renderer in `apps/renderer`.
- Existing local job/run-state storage under `.studio-data`.
- Existing tests via `node --test` and build via `pnpm -s build`.

## Design Principles

- LLMs decide intent, never local file truth.
- Deterministic code resolves assets, probes durations, syncs timestamps, caches, and renders.
- Every LLM output is parsed by a strict schema before it can mutate project artifacts.
- Existing projects remain valid through migration/fallback logic.
- Renderer components stay pure: no network calls, no OpenAI calls, no filesystem reads.
- Progress is a first-class artifact, not a UI guess.

## Phase 0: Cleanup And Stabilization

### Task 1: Move orchestration code out of the monolithic Studio server

**Files:**

- Create: `apps/studio/lib/openai-structured-output.mjs`
- Create: `apps/studio/lib/plan-draft-orchestrator.mjs`
- Create: `apps/studio/lib/tts-routing-orchestrator.mjs`
- Modify: `apps/studio/server.mjs`

**Action:**

Extract these concerns from `server.mjs`:

- `extractResponseText`
- common OpenAI POST helper
- planner schema construction
- TTS routing schema construction
- future orchestration schema construction

Keep `server.mjs` responsible for HTTP routes and job coordination only.

**Verify:**

```bash
node --check apps/studio/server.mjs
pnpm -s build
node --test apps/studio/test/prompt-controls.test.mjs
```

**Commit:** `refactor(studio): extract LLM orchestration helpers`

---

### Task 2: Remove heuristic TTS routing permanently

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/test/prompt-controls.test.mjs`

**Action:**

Ensure no text-pattern router remains. Beat TTS provider must come from:

1. `beat.voiceDirection.ttsProvider`
2. `beat.direction.voice.ttsProvider`
3. project default provider

Do not add language regex or name heuristics.

**Verify:**

```bash
rg -n "tagalogScore|regex|\\btagalog\\b|\\bfilipino\\b" apps/studio/server.mjs packages/core/src
node --test apps/studio/test/prompt-controls.test.mjs
```

Expected: no heuristic routing function exists; prompt/tests mention LLM routing only.

**Commit:** `chore(studio): remove heuristic TTS routing`

---

### Task 3: Clean generated/transient artifacts

**Files:**

- Remove if unneeded: `scripts/__pycache__/`
- Decide with user: `console-debug.md`
- Do not commit generated project artifacts unless explicitly requested:
  - `content/projects/the-mound/`

**Action:**

Clean Python cache and leave user/project artifacts untouched unless asked. Add ignore rules only if the repo does not already ignore these paths.

**Verify:**

```bash
git status --short
```

**Commit:** `chore(repo): clean transient debug artifacts`

## Phase 1: Formalize The Plan Contract

### Task 4: Add visual orchestration schema

**Files:**

- Modify: `packages/core/src/schemas/video-plan.schema.ts`
- Modify: `packages/core/test/resolve-production-direction.test.mjs`

**Action:**

Add a structured visual intent schema without removing existing `media` fields:

```ts
export const VisualIntentSchema = z.object({
  prompt: z.string().optional(),
  priority: z.number().int().min(1).max(5).default(3),
  needsUniqueImage: z.boolean().default(false),
  reusePolicy: z.union([
    z.literal("none"),
    z.literal("allow-reuse"),
    z.string().min(1)
  ]).default("allow-reuse"),
  coverageRole: z.enum(["anchor", "key_moment", "supporting", "none"]).default("supporting"),
  source: z.enum(["user", "llm", "default"]).default("default")
}).strict();
```

Add optional `visual: VisualIntentSchema` to `BeatSchema` and `ProductionDirectionSchema` if direction-level override is useful.

Compatibility:

- Existing `beat.media[0].prompt` remains valid.
- Existing image generation can fallback to `beat.media` until Phase 3.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/resolve-production-direction.test.mjs
```

**Commit:** `feat(core): add visual intent schema`

---

### Task 5: Add orchestration metadata schema

**Files:**

- Modify: `packages/core/src/schemas/video-plan.schema.ts`

**Action:**

Add project-level orchestration metadata:

```ts
orchestration: z.object({
  version: z.literal(1).default(1),
  model: z.string().optional(),
  orchestratedAt: z.string().datetime().optional(),
  warnings: z.array(z.string()).default([])
}).strict().optional()
```

Keep it optional so legacy plans parse.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/*.test.mjs
```

**Commit:** `feat(core): add plan orchestration metadata`

---

### Task 6: Add typed quality report schema

**Files:**

- Create: `packages/core/src/schemas/quality-report.schema.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/quality/src/index.ts`

**Action:**

Create a shared schema for deterministic quality findings so the repair LLM receives stable input:

```ts
QualityFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  path: z.string().optional(),
  beatId: z.string().optional(),
  sectionId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional()
}).strict()
```

Update `runQualityChecks` to populate `beatId`, `sectionId`, and structured `data` where possible.

**Verify:**

```bash
pnpm -s build
node --test packages/quality/test/quality-tuning-gates.test.mjs
```

**Commit:** `feat(quality): expose structured quality findings`

## Phase 2: Implement `orchestratePlanWithOpenAi`

### Task 7: Create orchestration prompt and strict output schema

**Files:**

- Create: `apps/studio/lib/plan-orchestrator.mjs`
- Modify: `apps/studio/test/prompt-controls.test.mjs`

**Action:**

Create `orchestratePlanWithOpenAi(plan, context)` that takes an already valid plan and returns an enriched plan.

The LLM must decide:

- `voiceDirection.language`
- `voiceDirection.ttsProvider`
- `visual.priority`
- `visual.needsUniqueImage`
- `visual.reusePolicy`
- `visual.coverageRole`
- `caption.style`
- `caption.emphasis`
- `editorial.visualEditCues`
- warnings

Prompt guardrails:

- Do not infer local filenames.
- Do not invent local assets.
- Use `mms` for Filipino/Tagalog narration.
- Use `chatterbox` for English narration.
- Keep edit cues sparse.
- Keep visual uniqueness cost-aware.
- Prefer reuse for continuity when the same location/subject persists.

**Verify:**

```bash
node --check apps/studio/lib/plan-orchestrator.mjs
node --test apps/studio/test/prompt-controls.test.mjs
```

**Commit:** `feat(studio): add LLM plan orchestration pass`

---

### Task 8: Wire orchestration into draft jobs

**Files:**

- Modify: `apps/studio/server.mjs`

**Action:**

After primary planning and before initial sync:

1. Parse plan with `VideoPlanSchema`.
2. Run `orchestratePlanWithOpenAi` if:
   - `body.orchestrate !== false`
   - plan lacks orchestration metadata
   - user requested re-orchestration
3. Write enriched `video-plan.json`.
4. Add job output: model, warnings, beat count.
5. Continue deterministic sync.

Do not run the older TTS-only routing pass when the full orchestrator ran successfully. Keep TTS-only routing as fallback for old plans if full orchestration is disabled.

**Verify:**

```bash
LVSTUDIO_TEST_MODE=1 node --test apps/studio/test/draft-flow-integration.test.mjs
pnpm -s build
```

**Commit:** `feat(studio): run plan orchestration during draft jobs`

---

### Task 9: Add orchestration UI affordance

**Files:**

- Modify: `apps/studio/public/index.html`
- Modify: `apps/studio/public/app.js`

**Action:**

Add an advanced checkbox:

- Label: `AI director pass`
- Default: checked
- Helper: `Maps TTS provider, visual coverage, captions, and edit cues before generation.`

Persist per project with existing localStorage helpers.

Include the value in `/draft-job` request body.

**Verify:**

```bash
node --check apps/studio/public/app.js
node --test apps/studio/test/prompt-controls.test.mjs
```

**Commit:** `feat(studio): expose AI director pass control`

## Phase 3: Make Visual Coverage LLM-Directed

### Task 10: Update image target selection to use visual intent

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/test/prompt-controls.test.mjs` or add `apps/studio/test/image-coverage.test.mjs`

**Action:**

Change image target selection priority:

1. Selected asset mode still wins.
2. If coverage is `beat`, generate all missing unlocked beat images.
3. If visual intent exists:
   - generate beats where `visual.needsUniqueImage === true`
   - generate beats with `coverageRole === "anchor"` or `"key_moment"`
   - respect `visual.priority >= threshold`
4. If no visual intent exists:
   - fallback to current `balancedSectionTargets` behavior.

Do not let the LLM specify actual local filenames.

**Verify:**

```bash
node --test apps/studio/test/image-coverage.test.mjs
pnpm -s build
```

**Commit:** `feat(studio): use visual intent for image coverage`

---

### Task 11: Make sync obey explicit reuse policy

**Files:**

- Modify: `packages/core/src/sync-project.ts`
- Modify: `packages/core/test/sync-project-sfx.test.mjs` or create `packages/core/test/sync-project-visual-reuse.test.mjs`

**Action:**

Update media resolution:

1. If exact beat asset exists, use it.
2. If `beat.visual.reusePolicy` is a beat id, use that beat's primary visual.
3. If `reusePolicy === "allow-reuse"`, use nearest section/key visual.
4. If `needsUniqueImage === true` and no exact asset exists, leave empty and let quality fail.
5. If no visual intent, keep current nearest section visual fallback.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/sync-project-sfx.test.mjs
```

**Commit:** `feat(core): resolve timeline media from visual reuse intent`

---

### Task 12: Add quality gates for visual intent

**Files:**

- Modify: `packages/quality/src/index.ts`
- Modify: `packages/quality/test/quality-tuning-gates.test.mjs`

**Action:**

Add deterministic checks:

- Error: `needsUniqueImage === true` but timeline reused another beat's asset.
- Warning: `visual.priority >= 4` but no unique image.
- Warning: too many unique images for a short section if cost constraints are enabled.
- Info: beat reused visual from source beat.

**Verify:**

```bash
pnpm -s build
node --test packages/quality/test/quality-tuning-gates.test.mjs
```

**Commit:** `feat(quality): validate visual orchestration intent`

## Phase 4: Durable Job State Machine

### Task 13: Add typed job stage model

**Files:**

- Create: `apps/studio/lib/job-state.mjs`
- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/public/app.js`

**Action:**

Define canonical stages:

```js
[
  "queued",
  "planning",
  "orchestrating",
  "syncing",
  "generating_images",
  "generating_tts",
  "transcribing",
  "captioning",
  "checking",
  "repairing",
  "rendering",
  "completed",
  "failed",
  "stopped"
]
```

Each job state update should include:

- `jobId`
- `kind`
- `stage`
- `status`
- `message`
- `completed`
- `total`
- `percent`
- `currentBeatId`
- `currentSectionId`
- `updatedAt`
- `events[]` append-only list capped to last 200

**Verify:**

```bash
node --check apps/studio/lib/job-state.mjs
node --check apps/studio/server.mjs
node --test apps/studio/test/draft-flow-integration.test.mjs
```

**Commit:** `feat(studio): add typed draft job state machine`

---

### Task 14: Replace ad hoc progress updates with stage events

**Files:**

- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/public/modules/job-center.js`
- Modify: `apps/studio/public/app.js`

**Action:**

Replace `phase` string patches with `transitionJobStage(job, stage, patch)`.

Update UI to show:

- stage label
- percent
- beat counter
- current section
- latest event message

Polling should use `/api/projects/:id/draft-job` and `/api/projects/:id/jobs` consistently.

**Verify:**

```bash
node --check apps/studio/public/app.js
node --test apps/studio/test/draft-flow-integration.test.mjs
```

**Commit:** `feat(studio): surface durable draft progress events`

---

### Task 15: Add resumability metadata without external queues

**Files:**

- Modify: `apps/studio/lib/job-state.mjs`
- Modify: `apps/studio/server.mjs`

**Action:**

Persist completed stage outputs:

- `planHash`
- `timelineHash`
- `imageGenerationCompleted`
- `ttsBeatIdsCompleted`
- `transcriptHash`
- `captionsHash`
- `renderPath`

On server restart:

- Mark active in-memory jobs as `stopped`.
- Preserve completed stage metadata.
- UI can offer `Resume Draft` later, but initial implementation can say `Start Make Draft again to resume from generated assets`.

**Verify:**

```bash
node --test apps/studio/test/draft-flow-integration.test.mjs
```

Manual:

1. Start draft.
2. Kill Studio server during TTS.
3. Restart Studio.
4. Confirm job shows stopped, not running forever.

**Commit:** `feat(studio): persist resumable draft stage metadata`

## Phase 5: Repair Loop With Circuit Breaker

### Task 16: Create plan patch schema

**Files:**

- Create: `packages/core/src/schemas/plan-patch.schema.ts`
- Modify: `packages/core/src/index.ts`

**Action:**

Define a small patch format instead of allowing arbitrary full-plan rewrites:

```ts
PlanPatchSchema = z.object({
  operations: z.array(z.object({
    op: z.enum(["replace", "merge", "splitBeat", "deleteBeat"]),
    path: z.string(),
    value: z.unknown().optional(),
    reason: z.string()
  })).max(20)
}).strict()
```

Prefer patching beats/sections over replacing entire project plans.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(core): add plan patch schema`

---

### Task 17: Implement deterministic patch application

**Files:**

- Create: `packages/core/src/apply-plan-patch.ts`
- Create: `packages/core/test/apply-plan-patch.test.mjs`
- Modify: `packages/core/src/index.ts`

**Action:**

Implement patch operations with validation:

- Apply patch to parsed `VideoPlan`.
- Re-parse final plan with `VideoPlanSchema`.
- Preserve user-locked fields by rejecting patches to locked paths.
- Record patch reasons in `directionMeta.sources` or orchestration metadata.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/apply-plan-patch.test.mjs
```

**Commit:** `feat(core): apply validated plan repair patches`

---

### Task 18: Add `repairPlanWithOpenAi`

**Files:**

- Create: `apps/studio/lib/plan-repair-orchestrator.mjs`
- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/test/prompt-controls.test.mjs`

**Action:**

Input:

- current plan
- structured quality findings
- attempt number
- max attempts

Output:

- `PlanPatchSchema`
- warnings
- rationale

Guardrails:

- `MAX_REPAIR_ATTEMPTS = 2`
- only repair errors/warnings from deterministic findings
- no local filename invention
- no provider invention
- preserve locked user edits

**Verify:**

```bash
node --check apps/studio/lib/plan-repair-orchestrator.mjs
node --test apps/studio/test/prompt-controls.test.mjs
```

**Commit:** `feat(studio): add LLM plan repair pass`

---

### Task 19: Wire repair into draft jobs

**Files:**

- Modify: `apps/studio/server.mjs`

**Action:**

After quality check:

1. If quality passes, render.
2. If quality fails and `repairAttempts < MAX_REPAIR_ATTEMPTS`:
   - transition to `repairing`
   - call `repairPlanWithOpenAi`
   - apply patch
   - write plan
   - rerun sync and affected generation stages only where possible
   - rerun quality
3. If still failing:
   - mark job `failed_needs_review` or `completed_with_quality_errors`
   - do not loop

Initial policy:

- Do not auto-repair if fixes would require paid image regeneration unless `body.allowRepairGeneration === true`.
- Do not auto-render if quality has `error` severity unless user used force.

**Verify:**

```bash
LVSTUDIO_TEST_MODE=1 node --test apps/studio/test/draft-flow-integration.test.mjs
pnpm -s build
```

Manual:

1. Create a project with an intentionally long beat.
2. Confirm one repair attempt splits/shortens it.
3. Confirm max attempts stops cleanly.

**Commit:** `feat(studio): run bounded repair loop before render`

## Phase 6: Caption Emphasis Mapping

### Task 20: Add caption emphasis span schema

**Files:**

- Modify: `packages/core/src/schemas/captions.schema.ts`
- Modify: `apps/renderer/src/components/CaptionLayer.tsx`

**Action:**

Add optional spans:

```ts
emphasisSpans: z.array(z.object({
  startWordIndex: z.number().int().nonnegative(),
  endWordIndex: z.number().int().positive(),
  phrase: z.string()
})).default([])
```

Renderer should apply an emphasis class/style to words in span.

**Verify:**

```bash
pnpm -s build
```

**Commit:** `feat(captions): support emphasized word spans`

---

### Task 21: Implement deterministic phrase-to-word matching

**Files:**

- Create: `packages/core/src/caption-emphasis.ts`
- Create: `packages/core/test/caption-emphasis.test.mjs`
- Modify: `packages/core/src/generate-captions.ts`

**Action:**

Implement fuzzy phrase matching:

- Normalize punctuation/case.
- Match phrase tokens against transcript words within the same beat.
- Allow small punctuation differences.
- Return word index spans.
- If phrase cannot be matched, skip and add warning metadata.

Do not ask the LLM for timestamps.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/caption-emphasis.test.mjs packages/core/test/generate-captions.test.mjs
```

**Commit:** `feat(captions): map LLM emphasis phrases to transcript words`

## Phase 7: Safe Parallelism

### Task 22: Split generation into dependency-aware tasks

**Files:**

- Modify: `apps/studio/server.mjs`
- Optional create: `apps/studio/lib/draft-job-runner.mjs`

**Action:**

Refactor draft job execution into explicit async tasks:

- `planTask`
- `orchestrateTask`
- `syncTask`
- `imageTask`
- `ttsTask`
- `transcribeTask`
- `captionTask`
- `qualityTask`
- `repairTask`
- `renderTask`

Allowed concurrency:

- `imageTask` can run concurrently with `ttsTask` after orchestration and initial sync.
- TTS can run per beat with provider-specific concurrency.
- Transcription waits for TTS.
- Captions wait for transcription.
- Render waits for sync, captions, and quality policy.

Use `Promise.allSettled` only for independent branches, and translate failures into job events.

**Verify:**

```bash
LVSTUDIO_TEST_MODE=1 node --test apps/studio/test/draft-flow-integration.test.mjs
pnpm -s build
```

Manual:

1. Draft with images enabled.
2. Confirm UI shows image and TTS progress independently.
3. Confirm final render waits for both.

**Commit:** `feat(studio): parallelize independent draft generation stages`

## Phase 8: Studio Review And Manual Control

### Task 23: Show orchestration intent in beat inspector

**Files:**

- Modify: `apps/studio/public/modules/beat-workspace.js`
- Modify: `apps/studio/public/styles.css`

**Action:**

Show/edit:

- language
- TTS provider
- visual priority
- needs unique image
- reuse policy
- caption emphasis
- visual edit cues summary

Respect existing lock mechanism:

- `voice`
- `visual`
- `caption.emphasis`
- `editorial`

**Verify:**

```bash
node --check apps/studio/public/modules/beat-workspace.js
```

Manual:

1. Load existing project.
2. Edit TTS provider for one beat.
3. Save plan.
4. Regenerate only that beat and confirm provider is used.

**Commit:** `feat(studio): expose orchestration intent in beat inspector`

---

### Task 24: Add quality repair review UI

**Files:**

- Modify: `apps/studio/public/modules/workspace.js`
- Modify: `apps/studio/public/app.js`
- Modify: `apps/studio/public/styles.css`

**Action:**

When quality fails after repair attempts:

- show findings grouped by severity
- show proposed repair history
- offer actions:
  - `Run Repair Again`
  - `Accept Render Anyway`
  - `Edit Beat`
  - `Regenerate Images`

Do not hide quality failures behind a successful render.

**Verify:**

```bash
node --check apps/studio/public/app.js
```

Manual:

1. Force quality failure.
2. Confirm grouped findings and actions.

**Commit:** `feat(studio): add repair review workflow`

## Phase 9: End-To-End Verification

### Task 25: Add fixture for multilingual story orchestration

**Files:**

- Create: `apps/studio/test/orchestration-fixture.test.mjs`

**Action:**

In `LVSTUDIO_TEST_MODE`, verify:

- plan has `voiceDirection.language`
- Tagalog beat is routed to `mms` from mocked orchestrator output
- English beats stay `chatterbox`
- generated job progress exposes per-beat TTS status

**Verify:**

```bash
LVSTUDIO_TEST_MODE=1 node --test apps/studio/test/orchestration-fixture.test.mjs
```

**Commit:** `test(studio): cover multilingual orchestration flow`

---

### Task 26: Add visual reuse fixture

**Files:**

- Create: `packages/core/test/sync-project-visual-reuse.test.mjs`

**Action:**

Verify:

- `needsUniqueImage` without asset leaves media empty and quality catches it.
- explicit `reusePolicy` beat id maps to that beat's asset.
- `allow-reuse` maps nearest section/key visual.

**Verify:**

```bash
pnpm -s build
node --test packages/core/test/sync-project-visual-reuse.test.mjs
```

**Commit:** `test(core): cover visual reuse sync policies`

---

### Task 27: Full local smoke flow

**Files:**

- Modify if needed: `package.json`
- Optional create: `scripts/smoke_orchestrated_draft.sh`

**Action:**

Add a repeatable smoke command for orchestrated drafts in test mode. It should avoid paid API calls unless explicitly enabled.

Checks:

- create project
- plan
- orchestrate
- sync
- generate mock or cached assets
- captions
- quality
- render stub/test mode

**Verify:**

```bash
LVSTUDIO_TEST_MODE=1 node --test apps/studio/test/draft-flow-integration.test.mjs apps/studio/test/orchestration-fixture.test.mjs
pnpm -s build
```

**Commit:** `test(studio): add orchestrated draft smoke coverage`

## Migration Strategy

Existing plans should continue to work.

Rules:

- If `beat.visual` is missing, fallback to `beat.media`.
- If `voiceDirection.ttsProvider` is missing, run orchestration or fallback to project provider.
- If `voiceDirection.language` is missing, run orchestration or fallback to project language.
- If `orchestration` metadata is missing, Studio can offer `Run AI Director Pass`.
- Do not mutate user-locked fields unless explicitly forced.

## Risks And Mitigations

- **Risk:** LLM returns valid schema but bad creative choices.
  **Mitigation:** deterministic quality gates plus human review UI.

- **Risk:** Repair loop burns credits.
  **Mitigation:** `MAX_REPAIR_ATTEMPTS = 2`, clear job failure state.

- **Risk:** Visual reuse hides needed unique images.
  **Mitigation:** quality check for high-priority/unique visual intent.

- **Risk:** Job progress gets stale again.
  **Mitigation:** append-only job events and active stage normalization.

- **Risk:** Large `server.mjs` keeps growing.
  **Mitigation:** extract orchestration and job runner modules in Phase 0/4.

## Recommended Implementation Order

1. Phase 0 cleanup/extraction.
2. Phase 1 schema contract.
3. Phase 2 full orchestration pass.
4. Phase 3 visual intent execution.
5. Phase 4 job state machine.
6. Phase 5 repair loop.
7. Phase 6 caption emphasis.
8. Phase 7 safe parallelism.
9. Phase 8 Studio review controls.
10. Phase 9 end-to-end tests.

Do not start with parallelism or external queues. The contract and progress model need to be stable first.

## Definition Of Done

- New projects get a full AI director pass before generation.
- No heuristic language/TTS guessing remains.
- Visual coverage is primarily LLM-directed and deterministically enforced.
- Balanced/lean/full image modes map onto visual intent, not blind first/middle/last selection.
- Quality errors can trigger at most two repair attempts.
- UI shows accurate stage/counter updates throughout a draft.
- Existing projects still load and can be migrated by running orchestration.
- Remotion remains pure and receives deterministic render bundles only.
- Focused tests and `pnpm -s build` pass.
