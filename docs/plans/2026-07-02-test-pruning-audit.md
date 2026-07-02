# Test Pruning Audit

Date: 2026-07-02

## Position

Deleting 70% of tests is not defensible for this repo as a blanket target. The current suite is serving as the architecture sensor layer: route boundaries, env boundaries, schema/migration boundaries, provider contracts, and workflow delegation. A safer target is to delete or merge tests that duplicate another layer, execute helper files as tests, or assert trivial wrappers.

## Inventory

- Tracked test/support surface before this pass: about 115 files and 12.4k lines.
- Studio node tests before helper cleanup: 197 reported test entries.
- Studio node tests after helper cleanup: 194 real tests, passing.
- The largest test clusters are `apps/studio/test`, `packages/core/test`, Studio web Vitest tests, and a few package adapter suites.

## Already Removed

- Deleted unused legacy helper: `apps/studio/test/helpers/fake-dom.mjs`.
- Renamed live helper modules from `.mjs` to `.js` so `node --test "test/**/*.mjs"` stops executing them as standalone test files:
  - `apps/studio/test/helpers/project-fs-helpers.js`
  - `apps/studio/test/helpers/route-test-helpers.js`
- Removed unused internal frontend exports:
  - `buildStoredUiState` and dead types from `apps/studio/web/src/lib/story-ui-state.ts`
  - `projectTitleFromStory` and its private quote-strip helper from `apps/studio/web/src/lib/story-parser.ts`
  - `useProject` from `apps/studio/web/src/queries/projects.ts`
  - `usePatchAssetStatus` from `apps/studio/web/src/queries/assets.ts`

## High-Confidence Next Deletes

1. Delete two duplicated HTTP integration cases and keep one binding smoke:
   - `apps/studio/test/studio-http-integration.test.mjs`
   - Delete `studio http handler routes plan save through sync/check and run-state update`.
   - Delete `studio http handler restores files when plan save sync step fails`.
   - Keep `studio http handler routes project create through to filesystem writes` to satisfy the repo rule that route/server wiring has binding coverage.
   - Why: the plan-save success and rollback behavior is already covered directly in `apps/studio/test/studio-project-asset-routes-behavior.test.mjs`.

2. Delete or merge `apps/studio/test/studio-api-context.test.mjs`.
   - Why: `createStudioApiContext` is only a wrapper around `createRouteCapabilities`.
   - Safer variant: inline `createRouteCapabilities` in `createStudioRuntime`, delete `studio-api-context.mjs`, and rely on `studio-routes-deps.test.mjs` plus route behavior tests for missing dependency failures.

3. Delete `apps/studio/web/src/components/__tests__/TtsHealthPill.test.tsx`.
   - Why: it retests the same health states already covered in `apps/studio/web/src/lib/__tests__/tts-ui-state.test.ts`.
   - Keep the view-model test; it has better coverage with less rendering overhead.

4. Delete or consolidate the two pure React Query wrapper tests:
   - `apps/studio/web/src/queries/__tests__/voice-settings.test.tsx`
   - `apps/studio/web/src/queries/__tests__/direct-voice.test.tsx`
   - Why: they mostly verify TanStack Query calls a mocked mutation function.
   - Keep `beat-regeneration.test.tsx` or fold these into one mutation-smoke file, because `useRegenerateBeat` includes a project-specific payload transform.

5. Trim migration CLI duplication in `packages/cli/test/migrate-plan-cli.test.mjs`.
   - Good candidates:
     - Delete `migrate:plan --all --dry-run reports needed migrations without writing files`.
     - Consider deleting `migrate:plan canonicalizes pause seconds on canonical direction.voice`.
   - Why: single-project dry-run, `--all`, and core normalization tests already cover the meaningful axes.

6. Delete or rewrite `packages/core/test/migrate-video-plan.test.mjs` case `migrateVideoPlan writes canonical beat direction and strips legacy fields`.
   - Why: the fixture is already canonical, so the test name promises legacy coverage it does not provide.
   - If keeping it, rewrite the fixture to include actual legacy beat fields; otherwise the CLI migration test already covers the write path with legacy input.

## Refactor, Do Not Delete

- `packages/core/test/sync-project-sfx.test.mjs`: fixture-heavy, but each case covers a distinct `syncProject` behavior. Extract project/manifest builders instead of deleting behavior.
- `packages/quality/test/quality-tuning-gates.test.mjs`: large fixture, but it protects multi-check quality behavior. Prefer fixture builders.
- `apps/studio/test/studio-routes-behavior.test.mjs` and `apps/studio/test/studio-project-asset-routes-behavior.test.mjs`: long files, but they protect thin route adapters and route/context binding. Remove only cases duplicated by a higher-level integration test.
- MCP and workflow tests: keep. They are public tool/delegation contracts.

## Do Not Cut Blindly

Keep tests that protect these classes of defects:

- schema and migration normalization
- env/default alignment
- route dependency contracts
- unsafe path/project-id rejection
- rollback behavior around project writes
- provider error shaping and injected client/runtime behavior
- MCP public tool names and input schema contracts
- renderer/workflow blocking behavior

## Realizations

- problem: helper modules under `apps/studio/test/helpers` used `.mjs`, so the Studio node-test glob executed them as no-op test files.
  impact: inflated test counts and wasted module-load time, especially for `route-test-helpers`.
  improvement: keep live helpers as `.js` or move them outside the `test/**/*.mjs` glob.

- problem: some migration tests claim legacy behavior but use canonical fixtures.
  impact: coverage looks stronger than it is, while duplicate subprocess tests add noise.
  improvement: delete duplicate CLI cases and rewrite any remaining core migration test so the fixture matches the claim.

- problem: several frontend tests exercise thin React Query or view-model wrappers separately.
  impact: many tiny tests increase maintenance overhead without proportionate defect detection.
  improvement: keep pure view-model tests and one mutation payload/invalidation smoke, delete static wrapper-only tests.
