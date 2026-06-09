# Render Workflow Correctness Plan

Date: 2026-06-09

## Goal

Ensure quality checks certify the exact `RenderBundle` that gets rendered, then move render orchestration out of adapters so CLI, MCP, and Studio share one typed workflow.

## Architecture Overview

Today, quality and render can rebuild project state separately. The first correction is to make `packages/quality` accept a prebuilt `RenderBundle`, so adapters can build once and pass the same artifact to quality and renderer. After that, extract the render pipeline into a shared workflow module so CLI/MCP/Studio do not each reimplement validate → sync → quality → bundle → render.

## Tech Stack

- TypeScript ESM
- Existing `@lvstudio/core` `RenderBundle`
- Existing `@lvstudio/quality` quality report schema
- Node test runner
- Existing `pnpm -s verify` gate

## Phase 1: Certify The Same Bundle That Renders

### Task 1: Add a quality test for bundle reuse

**Files:**

- Modify: `packages/quality/test/quality-tuning-gates.test.mjs`

**Action:**

Add a test that builds a bundle once with `buildRenderBundle({ projectId, rootDir })`, then calls a new quality API with that bundle:

```js
const bundle = await buildRenderBundle({ projectId, rootDir });
const result = await runQualityChecksForBundle(projectId, bundle, rootDir);
assert.equal(result.status, "warn");
```

**Verify RED:**

```bash
pnpm -s --filter @lvstudio/quality test
# Expected: fails because runQualityChecksForBundle is not exported.
```

**Commit:** `test(quality): require quality checks to accept render bundle`

---

### Task 2: Implement bundle-aware quality checks

**Files:**

- Modify: `packages/quality/src/index.ts`

**Action:**

Extract the current quality implementation into:

```ts
export async function runQualityChecksForBundle(
  projectId: string,
  bundle: RenderBundle,
  rootDir = process.cwd(),
): Promise<QualityResult>;
```

Keep `runQualityChecks(projectId, rootDir)` as compatibility wrapper:

```ts
const bundle = await buildRenderBundle({ projectId, rootDir });
return runQualityChecksForBundle(projectId, bundle, rootDir);
```

Inside the extracted function:

- Keep `loadProject(projectId, rootDir)` only if quality still needs loaded artifacts not present in the bundle.
- Prefer `bundle.videoPlan`, `bundle.assetManifest`, `bundle.timeline`, and `bundle.captions` where possible.
- Do not call `buildRenderBundle` from `runQualityChecksForBundle`.

**Verify GREEN:**

```bash
pnpm -s --filter @lvstudio/quality test
```

**Commit:** `feat(quality): support checking a prebuilt render bundle`

---

### Task 3: Update CLI render to build once

**Files:**

- Modify: `packages/cli/src/index.ts`
- Add/modify CLI render test if needed under `packages/cli/test/`

**Action:**

Change the `render` command from:

```ts
const bundle = await buildRenderBundle({ projectId });
const qualityResult = await runQualityChecks(projectId);
```

to:

```ts
const bundle = await buildRenderBundle({ projectId });
const qualityResult = await runQualityChecksForBundle(projectId, bundle);
```

This preserves the current CLI behavior but removes the second bundle build.

**Verify:**

```bash
pnpm -s --filter @lvstudio/cli test
```

**Commit:** `fix(cli): render the same bundle that quality checks`

---

### Task 4: Update MCP render to build once

**Files:**

- Modify: `packages/mcp-server/src/index.ts`
- Modify: `packages/mcp-server/test/index.test.mjs`

**Action:**

Update injected dependencies to include `runQualityChecksForBundle`. In `lvstudio_render_project`, build the bundle before quality:

```ts
const bundle = await deps.buildRenderBundle({ projectId: input.projectId });
const quality = await deps.runQualityChecksForBundle(input.projectId, bundle);
```

Add a test that injects `buildRenderBundle` and `runQualityChecksForBundle`, records the bundle object identity, and asserts the same object is passed to quality and render.

**Verify:**

```bash
pnpm -s --filter @lvstudio/mcp-server test
```

**Commit:** `fix(mcp): render the same bundle that quality checks`

---

## Phase 2: Extract Shared Render Workflow

### Task 5: Add a shared render workflow test

**Files:**

- Create: `packages/workflows/test/render-workflow.test.mjs`

**Action:**

Test a new workflow function that orchestrates:

1. validate
2. optional sync
3. build bundle
4. quality check against that bundle
5. render provider call

The test should use injected dependencies and assert stage order plus bundle object identity.

**Verify RED:**

```bash
pnpm -s --filter @lvstudio/core test
```

**Commit:** `test(core): define render workflow contract`

---

### Task 6: Implement shared render workflow

**Files:**

- Create: `packages/workflows/src/render-workflow.ts`
- Create: `packages/workflows/src/index.ts`
- Create: `packages/workflows/package.json`
- Create: `packages/workflows/tsconfig.json`

**Action:**

Implement a typed function such as:

```ts
export async function runRenderWorkflow(input, deps): Promise<RenderWorkflowResult>;
```

Keep provider registries injected. This workflow lives in `packages/workflows` because it depends on both `@lvstudio/core` and `@lvstudio/quality`, and putting it in `core` would create a package cycle.

**Verify GREEN:**

```bash
pnpm -s --filter @lvstudio/core test
```

**Commit:** `feat(workflows): add shared render workflow`

---

### Task 7: Thin CLI and MCP adapters over shared workflow

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/mcp-server/src/index.ts`
- Modify related tests

**Action:**

Replace adapter-local render orchestration with calls to the shared workflow. CLI maps options to workflow input and prints output. MCP maps tool args to workflow input and returns the structured result.

**Verify:**

```bash
pnpm -s --filter @lvstudio/cli test
pnpm -s --filter @lvstudio/mcp-server test
```

**Commit:** `refactor(render): share render workflow across adapters`

---

## Phase 3: Plan Async MCP Jobs

### Task 8: Document MCP job boundary

**Files:**

- Modify: `docs/mcp-server.md`
- Modify: `docs/plans/2026-06-08-agentic-workflow-improvements.md`

**Action:**

Specify the intended submit/status/cancel tools for long-running operations:

- `lvstudio_start_render_job`
- `lvstudio_get_render_job`
- `lvstudio_cancel_render_job`
- later `lvstudio_start_draft_job`

Call out that current `lvstudio_render_project` is synchronous and should remain for small/local runs only until job tools land.

**Verify:**

```bash
pnpm -s format:check
```

**Commit:** `docs(mcp): define async render job boundary`

## Final Verification

After each phase:

```bash
pnpm -s verify
```

Expected: full gate passes. Existing lint warnings may remain, but no errors.

## Risks And Decisions

- `packages/quality` currently owns deterministic quality checks and imports `buildRenderBundle`. Keeping `runQualityChecks` as a wrapper avoids breaking callers.
- Putting the shared render workflow in `packages/core` is only acceptable if providers stay injected. If the workflow needs concrete provider registries, create a dedicated workflow package instead.
- Studio still shells out to CLI for some operations. Do not broaden that pattern; migrate one workflow at a time behind typed workflow functions.
