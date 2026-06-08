# Agentic Workflow Improvements

Date: 2026-06-08

## Goal

Make Local Video Studio easier for agents to operate autonomously without weakening the repo boundaries or relying on unverified prose.

## Architecture Direction

Use cookbook-style agent patterns only where this repo already has deterministic contracts around them:

- **Prompt chaining** for draft creation: story parsing → plan generation → canonicalization → sync → quality → render.
- **Evaluator-optimizer** for repair: quality report → schema-valid patch proposal → deterministic migration/canonicalization → quality rerun.
- **Orchestrator-workers** for independent media work: section/beat image generation, TTS, transcription, and captions with scoped inputs and structured run traces.
- **Outcome grading** for prompt changes: fixture-driven planner/TTS/image evals that can fail CI before a prompt regression lands.

The control surface should be named workflows and MCP tools. Do not expose broad filesystem mutation or route/server internals to agents.

## Current Strengths

- `pnpm -s verify` composes formatting, linting, boundary checks, build, package tests, and Studio web tests.
- Zod schemas in `packages/core/src/schemas` are the canonical contracts.
- Studio has durable job state and run traces under `.studio-data`.
- Quality findings are structured enough to feed a repair loop.
- Existing MCP tools already expose validate, sync, quality, render, TTS, captions, and media import.

## Implementation Plan

### Task 1: Guard Agent Guidance Drift

**Files:**

- `scripts/check-agent-harness-docs.mjs`
- `package.json`
- `AGENTS.md`
- `docs/plans/2026-05-28-focused-goal-completion-audit.md`

**Action:**

Add a check that verifies repo-level agent guidance lists only real `check:*` scripts and that focused audit local file links still exist. Wire it into `pnpm -s verify`.

**Verify:**

```bash
pnpm -s check:agent-harness-docs
```

**Commit:** `chore(agent): guard agent harness docs`

---

### Task 2: Add High-Level Draft MCP Tooling

**Files:**

- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/test/index.test.mjs`
- `docs/mcp-server.md`

**Action:**

Add a deterministic high-level MCP workflow that prepares draft assets for an existing plan without importing Studio runtime internals.

Implemented tool:

- `lvstudio_prepare_draft_assets`: validate → sync → generate TTS → transcribe → captions → quality checks.

The full Studio background draft planner remains a separate boundary decision. The MCP server must not import Studio runtime internals directly. Prefer extracting a package-level command/workflow that both Studio and MCP can call, or expose a Studio-owned MCP surface only if it runs inside the Studio app boundary.

Candidate tools:

- `lvstudio_start_draft_job`
- `lvstudio_get_draft_job`
- `lvstudio_cancel_draft_job`

**Verify:**

```bash
pnpm -s build
node --test packages/mcp-server/test/index.test.mjs
```

**Commit:** `feat(mcp): add deterministic draft asset workflow`

---

### Task 3: Add Quality-Driven Repair Loop

**Files:**

- `packages/core/src/schemas`
- `packages/core/src/quality-repair-plan.ts`
- `packages/quality/src/index.ts`
- `packages/mcp-server/src/index.ts`
- `apps/studio/lib`
- package-local tests for pure repair planning

**Action:**

Add a repair planner that accepts a `QualityReport`, proposes bounded actions for known findings, canonicalizes any future mutations, reruns quality, and stops after a bounded number of attempts. Treat render `force` as an explicit user override, not as optimizer behavior.

First step implemented:

- `buildQualityRepairPlan()` maps known structured quality findings to non-mutating repair actions.
- `lvstudio_plan_quality_repairs` exposes the repair plan through MCP without writing project artifacts.
- Unknown error findings block the plan for explicit review.

Next expansion: add a mutation/apply layer for selected action kinds, then rerun quality with a circuit breaker.

**Verify:**

```bash
pnpm -s build
pnpm -s test
```

**Commit:** `feat(studio): add quality-driven plan repair`

---

### Task 4: Promote Prompt Evals To A Fixture Harness

**Files:**

- `apps/studio/test/planner-regression-evals.test.mjs`
- `apps/studio/test/fixtures/planner-regression-cases.json`
- prompt/orchestrator tests as needed

**Action:**

Turn current planner regression cases into a fixture-driven eval harness with named inputs and expected invariants.

First step implemented:

- `planner-regression-cases.json` owns the planner regression inputs.
- `planner-regression-evals.test.mjs` loads the fixture and verifies production cues stay metadata, not spoken narration.

Next expansion: add prompt version notes and equivalent narrow evals for TTS routing and image prompting before changing those prompts.

**Verify:**

```bash
node --test apps/studio/test/planner-regression-evals.test.mjs
```

**Commit:** `test(studio): expand agent prompt regression evals`

---

### Task 5: Add Agent Handoff Artifacts

**Files:**

- Studio run trace/state modules or a focused handoff writer
- docs describing the handoff format
- tests for generated handoff structure

**Action:**

For long-running draft/repair/render workflows, produce a concise handoff containing objective, job id, touched artifacts, quality result, render result, failures, and next recommended action.

**Verify:**

```bash
pnpm -s --filter @lvstudio/studio test
```

**Commit:** `feat(studio): write agent workflow handoffs`

## Guardrails

- Keep route handlers, MCP cases, and React render bodies thin.
- New agentic behavior must go through schemas, quality checks, run state, and trace artifacts.
- Do not let an LLM mutate generated artifacts directly.
- Add or tighten a check whenever a repeated agent mistake is found.
