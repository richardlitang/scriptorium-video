# Focused Goal Completion Audit (Top-Priority Scope)

Date: 2026-05-28

This audit covers the narrowed goal scope only:

1. server architecture decomposition
2. pause-field migration to canonical ms writes
3. runtime state/lifecycle controls
4. CI verification gate hardening
5. high-value integration coverage

## 1) Server Decomposition

Requirement: `apps/studio/server.mjs` should be thin bootstrap; orchestration should live in `lib/`.

Evidence:

- [`apps/studio/server.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/server.mjs) is 19 lines and only bootstraps runtime + starts server.
- [`apps/studio/lib/runtime/studio-server-runtime-factory.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/runtime/studio-server-runtime-factory.mjs) owns runtime graph assembly.
- [`apps/studio/lib/runtime/studio-runtime.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/runtime/studio-runtime.mjs), [`apps/studio/lib/routes/studio-http-handler.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/routes/studio-http-handler.mjs), and [`apps/studio/lib/runtime/studio-runtime-dependencies.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/runtime/studio-runtime-dependencies.mjs) enforce composition boundaries.
- Tests:
  - [`apps/studio/test/studio-http-handler.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/studio-http-handler.test.mjs)
  - [`apps/studio/test/studio-runtime.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/studio-runtime.test.mjs)
  - [`apps/studio/test/studio-runtime-dependencies.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/studio-runtime-dependencies.test.mjs)
  - [`apps/studio/test/studio-server-runtime-factory.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/studio-server-runtime-factory.test.mjs)

Status: Achieved.

## 2) Pause-Field Migration (ms-first)

Requirement: canonical write path is `pauseBeforeMs`/`pauseAfterMs`; seconds fields used only for legacy compatibility boundaries.

Evidence:

- Core canonicalization:
  - [`packages/core/src/voice-pauses.ts`](/Users/richardlitang/code/personal/scriptorium/packages/core/src/voice-pauses.ts) canonicalizes to ms fields and strips seconds on canonical output.
- Studio write paths:
  - [`apps/studio/web/src/components/BeatWorkspace.tsx`](/Users/richardlitang/code/personal/scriptorium/apps/studio/web/src/components/BeatWorkspace.tsx) writes ms fields through the plan update flow.
  - [`apps/studio/lib/draft/draft-voice-direction.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/draft/draft-voice-direction.mjs) emits ms fields.
- CLI write path:
  - [`packages/cli/src/direct-voice.ts`](/Users/richardlitang/code/personal/scriptorium/packages/cli/src/direct-voice.ts) prompts/schema use ms fields.
- Quality checks prefer ms with legacy fallback:
  - [`packages/quality/src/index.ts`](/Users/richardlitang/code/personal/scriptorium/packages/quality/src/index.ts)
- Fixture cleanup done in:
  - [`packages/core/test/tts-text-normalization.test.mjs`](/Users/richardlitang/code/personal/scriptorium/packages/core/test/tts-text-normalization.test.mjs)
  - [`packages/core/test/sync-project-sfx.test.mjs`](/Users/richardlitang/code/personal/scriptorium/packages/core/test/sync-project-sfx.test.mjs)
  - [`packages/quality/test/quality-tuning-gates.test.mjs`](/Users/richardlitang/code/personal/scriptorium/packages/quality/test/quality-tuning-gates.test.mjs)

Status: Achieved for focused scope.

## 3) Runtime State/Lifecycle Controls

Requirement: bounded caches and explicit lifecycle cleanup hooks for long-running process state.

Evidence:

- FIFO cap exists for preview cache:
  - [`apps/studio/lib/tts/voice-preview-health.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/tts/voice-preview-health.mjs)
- Lifecycle hooks added:
  - `clearPreviewCache()` and `previewCacheSize()`
  - `resetStartState()` in [`apps/studio/lib/tts/chatterbox-runtime.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/tts/chatterbox-runtime.mjs)
  - `dispose()` in [`apps/studio/lib/runtime/studio-server-runtime-factory.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/lib/runtime/studio-server-runtime-factory.mjs)
- Tests:
  - [`apps/studio/test/voice-preview-health.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/voice-preview-health.test.mjs)
  - [`apps/studio/test/chatterbox-runtime.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/chatterbox-runtime.test.mjs)
  - [`apps/studio/test/studio-server-runtime-factory.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/studio-server-runtime-factory.test.mjs)

Status: Achieved.

## 4) CI/Gate Hardening

Requirement: automated verify gate on push/PR with sensible execution controls.

Evidence:

- Workflow:
  - [`.github/workflows/verify.yml`](/Users/richardlitang/code/personal/scriptorium/.github/workflows/verify.yml)
  - runs on push + pull_request + workflow_dispatch
  - includes `concurrency` cancellation
  - uses least-privilege `permissions: contents: read`
  - runs `pnpm -s verify` with `CI=true`
- Verify composition:
  - [`package.json`](/Users/richardlitang/code/personal/scriptorium/package.json) includes renderer boundary + test-dist contract + build + tests
  - [`scripts/check-test-dist-contract.mjs`](/Users/richardlitang/code/personal/scriptorium/scripts/check-test-dist-contract.mjs)

Status: Achieved.

## 5) Integration Coverage (Route → FS chain)

Requirement: at least one reportable integration test for server route binding through filesystem mutation path.

Evidence:

- [`apps/studio/test/studio-http-integration.test.mjs`](/Users/richardlitang/code/personal/scriptorium/apps/studio/test/studio-http-integration.test.mjs)
  - exercises `createStudioHttpHandler` + `handleStudioApiRoute` + `createStudioApiContext`
  - verifies `/api/projects` write path and canonicalized persisted plan fields.

Status: Achieved.

## Current Verification Snapshot

Latest local checks in this run:

- `pnpm -s --filter @lvstudio/studio test` passed
- `pnpm -s verify` passed

## Remaining Gaps For Full Original (Unnarrowed) Goal

Out-of-scope or intentionally deferred:

- Full frontend TypeScript migration/build system work
- Broad lint/format adoption beyond current gate targets
- Larger schema unification beyond pause-field migration
- Expanded end-to-end render artifact smoke suite beyond current integration additions

For the narrowed top-priority scope, completion evidence is now direct and current.
