# Studio Architecture Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `apps/studio` server into the typed package graph: fix rotted sensors, migrate the `.mjs` server modules to TypeScript, call domain workflows in-process instead of shelling out to the CLI, regroup the route context into capability objects, and fold grep-based env-boundary checks into ESLint.

**Architecture:** The studio server currently lives outside the type system (70 untyped `.mjs` modules, zero `@lvstudio/core` imports server-side) and invokes all domain operations via `spawn("pnpm", ["lvstudio", ...])`, which rebuilds the whole workspace per call and returns results as stdout text. The target state: studio modules are `.mts` files type-checked by `apps/studio/tsconfig.json`, domain operations are imported functions from `@lvstudio/core` / `@lvstudio/quality` / `@lvstudio/workflows` / `@lvstudio/providers` (the exact pattern `packages/mcp-server/src/index.ts` already uses), and boundary rules live in `eslint.config.js` where the editor enforces them at edit time.

**Tech Stack:** pnpm workspace, TypeScript 5.9 (NodeNext), `tsx` for running `.mts` without a build step, Node built-in test runner, ESLint flat config, Zod 4.

**Background reading (do this first):**

- `AGENTS.md` (repo root) — the boundary table and sensor philosophy. This plan must not violate it.
- `packages/mcp-server/src/index.ts` — the reference for thin, dependency-injected adapters calling core/workflows in-process.
- `apps/studio/lib/runtime/studio-ops.mjs` — the subprocess seam this plan replaces.
- `docs/plans/2026-06-09-render-workflow-correctness.md` — how `@lvstudio/workflows` came to exist.

**Phase dependency order:** Phase 0 → Phase 1 → Phase 2 → Phase 3. Phase 4 is independent and can run any time. Each phase ends with a green `pnpm -s verify` and is independently shippable — treat each phase as a stopping point if context runs low, and leave a handoff note.

**Hard rules from AGENTS.md that apply to every task below:**

- Never work around a failing `check:*` script — if a task changes something a sensor pins (file paths, script names, doc lines), update the sensor **in the same commit** and say so in the commit message.
- Run `pnpm -s verify` before claiming any task complete; show the output.
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude <noreply@anthropic.com>`.

**Known environment caveat (verify before starting):** on this machine `pnpm -s verify` has previously failed only on `scripts/check-renderer-boundary.sh` because `rg` (ripgrep) was a shell function, not an installed binary — a pre-existing environment issue, not a code issue. Run `pnpm -s verify` once on clean `main` before Task 0.1 and record which checks (if any) fail; that is your baseline. Never "fix" a baseline failure by weakening a sensor — either install ripgrep (`brew install ripgrep`) or carry the known failure explicitly in every gate comparison.

---

## Phase 0 — Sensor repair and duplication removal

Small, fully-specified fixes. Do these first; they are prerequisites for trusting the gates used by later phases.

### Task 0.1: Remove the stale type-check glob

`tsconfig.studio.json` includes `apps/studio/public/modules/**/*.js`, but `apps/studio/public/modules/` was deleted in the React migration. The sensor silently checks nothing for that glob.

**Files:**

- Modify: `tsconfig.studio.json`

- [ ] **Step 1: Edit the include list**

Replace the `include` array in `tsconfig.studio.json`:

```json
"include": [
  "apps/studio/static-assets.mjs",
  "apps/studio/image-cache.mjs",
  "apps/studio/voice-settings.mjs"
]
```

(Only the `public/modules` line is removed; the three real files stay until Phase 1 replaces this tsconfig entirely.)

- [ ] **Step 2: Verify the sensor still passes**

Run: `pnpm -s check:studio`
Expected: exits 0, no output errors.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.studio.json
git commit -m "fix(studio): drop deleted public/modules glob from type-check include

The React migration removed apps/studio/public/modules; the glob matched
nothing, silently shrinking the check:studio sensor.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 0.2: Delete the duplicated `openai-api-key` module

`apps/studio/lib/planner/openai-api-key.mjs` is a byte-level copy (minus types) of `packages/core/src/openai-api-key.ts`. Core exports `parseEnvFile`, `readEnvFile`, and `resolveOpenAiApiKey` from its index (`packages/core/src/index.ts` line 13). Studio already declares `@lvstudio/core` as a workspace dependency (`apps/studio/package.json`).

**Files:**

- Delete: `apps/studio/lib/planner/openai-api-key.mjs`
- Modify: `apps/studio/lib/runtime/studio-server-runtime-factory.mjs` (the only lib importer)
- Modify: `apps/studio/test/openai-api-key.test.mjs`
- Modify: `package.json` (root — `studio` script)

- [ ] **Step 1: Confirm the import sites (do not skip)**

Run: `grep -rn "openai-api-key.mjs" apps/studio`
Expected importers: `apps/studio/lib/runtime/studio-server-runtime-factory.mjs` and `apps/studio/test/openai-api-key.test.mjs`. If others appear, repoint them with the same edit as Step 2.

- [ ] **Step 2: Repoint the runtime factory import**

In `studio-server-runtime-factory.mjs`, change the import specifier from the local module to the package:

```js
// before
import { resolveOpenAiApiKey } from "../planner/openai-api-key.mjs";
// after
import { resolveOpenAiApiKey } from "@lvstudio/core";
```

(Keep whatever named imports the file actually uses — check the existing import line and preserve all names; all three functions are exported from core.)

- [ ] **Step 3: Make the studio server build its dependency**

Importing `@lvstudio/core` at runtime requires `packages/core/dist` to exist. Update the root `package.json` script:

```json
"studio": "pnpm -s build && node apps/studio/server.mjs"
```

(`tsc -b` is incremental; warm runs cost ~1s.)

- [ ] **Step 4: Move the test to where the code lives**

Core owns this logic now. Check whether `packages/core` already has a test covering `parseEnvFile`/`resolveOpenAiApiKey` (`ls packages/core/test`). If not, move `apps/studio/test/openai-api-key.test.mjs` to `packages/core/test/openai-api-key.test.mjs` and change its import to `@lvstudio/core` (core's test script runs against dist via `check:test-dist-contract` conventions — match how existing core tests import). If core already covers it, delete the studio test.

- [ ] **Step 5: Delete the duplicate and verify**

```bash
git rm apps/studio/lib/planner/openai-api-key.mjs
pnpm -s verify
```

Expected: green. If `check:test-dist-contract` complains about the moved test's import style, follow the script's error message (`scripts/check-test-dist-contract.mjs` documents the expected pattern).

- [ ] **Step 6: Commit**

```bash
git add -u && git add packages/core/test/openai-api-key.test.mjs
git commit -m "refactor(studio): import openai-api-key from core, delete duplicate

The studio copy was byte-identical minus types. Studio now consumes the
canonical module via @lvstudio/core; the studio script builds first.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1 — TypeScript migration of the studio server

Migrate the 70 `.mjs` modules in `apps/studio/lib/` plus the 4 root-level files to `.mts`, batch by batch, leaf-first.

**Why `.mts` and not `.ts`:** under NodeNext resolution, an import specifier ending in `.mjs` resolves to a `.mts` source file. Renaming `foo.mjs → foo.mts` therefore requires **zero changes in any importer** — existing `import ... from "./foo.mjs"` lines keep working in both `tsc` and `tsx`. This makes each file rename independently shippable.

**Why not `checkJs` over everything at once:** flipping `checkJs` on 70 untyped files produces a wall of errors that would be fixed twice (once as JSDoc, once as TS). Instead: `allowJs: true, checkJs: false`, so unmigrated `.mjs` files pass through while every migrated `.mts` file is fully checked. Coverage grows file-by-file until `.mjs` is extinct.

### Task 1.1: Migration tooling

**Files:**

- Create: `apps/studio/tsconfig.json`
- Delete: `tsconfig.studio.json` (root)
- Modify: `package.json` (root — `check:studio`, `studio`, `format`, `format:check` scripts)
- Modify: `apps/studio/package.json` (`test` script, devDependencies)
- Modify: `eslint.config.js`

- [ ] **Step 1: Create `apps/studio/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "strict": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": [
    "server.mjs",
    "static-assets.mjs",
    "image-cache.mjs",
    "voice-settings.mjs",
    "lib/**/*.mjs",
    "lib/**/*.mts",
    "*.mts",
    "test/**/*.mts"
  ],
  "exclude": ["web", "node_modules"]
}
```

Note `strict: true` — new `.mts` files are held to the same standard as `packages/*`. If `tsconfig.base.json` settings conflict (read it first), prefer the base and note the difference in the commit message.

- [ ] **Step 2: Repoint scripts**

Root `package.json`:

```json
"check:studio": "tsc -p apps/studio/tsconfig.json",
"studio": "pnpm -s build && node --import tsx apps/studio/server.mjs",
"format": "prettier --write \"**/*.{ts,tsx,mts,js,mjs,json,md}\"",
"format:check": "prettier --check \"**/*.{ts,tsx,mts,js,mjs,json,md}\""
```

`apps/studio/package.json`:

```json
"test": "node --import tsx --test \"test/**/*.mjs\" \"test/**/*.mts\""
```

Add `tsx` to `apps/studio` devDependencies (`pnpm --filter @lvstudio/studio add -D tsx`). The `--import tsx` hook makes `node` resolve `.mjs` specifiers to `.mts` files exactly like `tsc` does, so tests keep importing production modules by their `.mjs` names throughout the migration.

- [ ] **Step 3: Delete root `tsconfig.studio.json`**

`git rm tsconfig.studio.json`. Grep for stragglers: `grep -rn "tsconfig.studio" package.json scripts AGENTS.md docs eslint.config.js` and update any hit.

- [ ] **Step 4: Extend ESLint to `.mts`**

In `eslint.config.js`, the TypeScript block currently matches `["**/*.ts", "**/*.tsx"]`. Change to:

```js
files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
```

The `projectService` option picks up `apps/studio/tsconfig.json` automatically (nearest tsconfig). The root `lint`/`lint:fix` script globs also need `.mts` added:

```json
"lint": "eslint \"**/*.{ts,tsx,mts}\" \"apps/studio/**/*.mjs\" \"apps/studio/server.mjs\"",
"lint:fix": "eslint --fix \"**/*.{ts,tsx,mts}\" \"apps/studio/**/*.mjs\" \"apps/studio/server.mjs\""
```

- [ ] **Step 5: Verify the pipeline end-to-end before migrating anything**

```bash
pnpm -s check:studio        # passes with 0 .mts files
pnpm --filter @lvstudio/studio test   # all studio tests green under tsx
pnpm -s verify
```

All must be green. Then start the server once and hit it: `pnpm studio` in background, `curl -s localhost:3333/api/projects | head -c 200`, then kill it. Expected: JSON response, no loader errors.

- [ ] **Step 6: Commit**

```bash
git add -u apps/studio/tsconfig.json
git commit -m "build(studio): add per-app tsconfig and tsx runner for incremental TS migration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Tasks 1.2–1.7: Migrate batches, leaf-first

**Per-file recipe (apply to every file in every batch):**

1. `git mv apps/studio/lib/<dir>/<name>.mjs apps/studio/lib/<dir>/<name>.mts` — importers need no changes.
2. Add types. Rules of engagement:
   - Type exported function signatures fully (parameters and return). Internal locals can rely on inference.
   - DI factory functions (`createXxx({ deps })`) get a named `XxxDeps` interface; export it.
   - Import domain types from `@lvstudio/core` (e.g. `VideoPlan`, `Project`, `QualityReport` — all schema types are exported from the core index). **Do not redeclare inline string unions** that exist as core types (`ScaleMode`, `SubjectPosition`, etc.) — AGENTS.md pins this.
   - Where a value is genuinely dynamic (parsed JSON from disk pre-validation), type it `unknown` and narrow; do not use `any`. ESLint will flag `any` under the TS block rules.
   - Do not refactor logic while migrating. Rename + types only. If you find a bug, note it in the commit body and fix it in a separate commit with a test.
3. Run `pnpm -s check:studio` and fix type errors in that file only.
4. After the whole batch: `pnpm --filter @lvstudio/studio test && pnpm -s verify`, then commit the batch.

**Batch order** (leaf modules first so importers always point at already-typed code; verify with a quick grep that nothing in an earlier batch imports from a later one — if it does, pull that file forward):

- [ ] **Task 1.2 — Batch A, leaf utilities (4 files):**
      `lib/routes/http-utils.mjs`, `lib/routes/route-utils.mjs`, `lib/routes/route-context.mjs`, `lib/runtime/studio-runtime-helpers.mjs`
      Commit: `refactor(studio): migrate route/runtime utilities to TypeScript`

- [ ] **Task 1.3 — Batch B, stores and project modules (10 files):**
      `lib/project/run-state-store.mjs`, `lib/project/run-trace-store.mjs`, `lib/project/trace-summaries.mjs`, `lib/project/agent-handoff-store.mjs`, `lib/project/project-mutation-queue.mjs`, `lib/project/project-read-ops.mjs`, `lib/project/project-media-ops.mjs`, `lib/project/project-ops.mjs`, `lib/project/studio-testmode-ops.mjs`, `lib/image/image-cache-store.mjs`
      Commit: `refactor(studio): migrate project stores and ops to TypeScript`

- [ ] **Task 1.4 — Batch C, planner and draft modules (26 files):**
      All of `lib/planner/*.mjs` (8 files after Task 0.2 deleted one) and all of `lib/draft/*.mjs` (17 files), plus `lib/image/image-library-metadata.mjs`.
      This batch contains the deep relative import in `lib/draft/plan-draft-orchestrator.mjs` — **leave the import specifier exactly as-is in this batch** (`../../../../packages/core/src/schemas/plan-draft.schema.mjs`); Task 1.8 handles it with its sensor. To type the schema import, add a local `// @ts-expect-error untyped .mjs schema shim, removed in Task 1.8` if needed.
      Commit: `refactor(studio): migrate planner and draft modules to TypeScript`

- [ ] **Task 1.5 — Batch D, image and tts modules (11 files):**
      Remaining `lib/image/*.mjs` (5 files) and all `lib/tts/*.mjs` (6 files).
      Commit: `refactor(studio): migrate image and tts modules to TypeScript`

- [ ] **Task 1.6 — Batch E, route handlers (10 files):**
      `lib/routes/routes-settings.mjs`, `lib/routes/routes-assets.mjs`, `lib/routes/routes-jobs.mjs`, `lib/routes/routes-projects-crud.mjs`, `lib/routes/routes-projects-plan.mjs`, `lib/routes/routes-projects-media.mjs`, `lib/routes/routes-projects-quality.mjs`, `lib/routes/routes-projects.mjs`, `lib/routes/studio-routes.mjs`, `lib/routes/studio-http-handler.mjs`
      The `*_ROUTE_KEYS` arrays become `as const` tuples so the context picker gets literal key types. The `studio-routes-deps.test.mjs` and `studio-routes-behavior.test.mjs` suites pin these — they must stay green unmodified.
      Commit: `refactor(studio): migrate route handlers to TypeScript`

- [ ] **Task 1.7 — Batch F, runtime wiring + entry (12 files):**
      Remaining `lib/runtime/*.mjs` (8 files), then `static-assets.mjs`, `image-cache.mjs`, `voice-settings.mjs`, and finally `server.mjs → server.mts`.
      Renaming `server.mjs` trips two sensors — update both **in the same commit**:
  1. Root script: `"studio": "pnpm -s build && node --import tsx apps/studio/server.mts"`
  2. `scripts/check-studio-server-bootstrap.mjs` line 4: `const serverPath = "apps/studio/server.mts";`
     Also flip `apps/studio/tsconfig.json`: remove the four `.mjs` entries from `include` and set `"allowJs": false` — every production file is now type-checked, no passthrough remains.
     Commit: `refactor(studio): complete server TypeScript migration, retire allowJs`

### Task 1.8: Replace the deep schema import with a package import

After Batch C/F, studio is typed and can import core's TS source of truth through the package boundary instead of reaching into `packages/core/src` with a relative path.

**Files:**

- Rename: `packages/core/src/schemas/plan-draft.zod.mjs` → `plan-draft.zod.ts`, `packages/core/src/schemas/plan-draft.schema.mjs` → `plan-draft.schema.ts`
- Modify: `packages/core/src/index.ts`, `apps/studio/lib/draft/plan-draft-orchestrator.mts`, `scripts/check-planner-schema-boundary.mjs`

- [ ] **Step 1: Convert the two schema shims to `.ts`**

`git mv` both files to `.ts`; fix the internal import (`plan-draft.schema.ts` imports `./plan-draft.zod.js` under NodeNext). Add types only; the Zod object and the `z.toJSONSchema` generation logic must not change — `test/plan-draft-schema-generation.test.mjs` locks the generated output against a frozen fixture and must stay green unmodified. Check where that test lives (`grep -rn "plan-draft-schema-generation" packages`) and update its import path if it referenced the `.mjs` files directly.

- [ ] **Step 2: Export from the core index**

Append to `packages/core/src/index.ts`:

```ts
export * from "./schemas/plan-draft.zod.js";
export * from "./schemas/plan-draft.schema.js";
```

- [ ] **Step 3: Repoint the orchestrator**

In `apps/studio/lib/draft/plan-draft-orchestrator.mts`:

```ts
// before
import { PlanDraftSchema as CORE_PLAN_DRAFT_SCHEMA } from "../../../../packages/core/src/schemas/plan-draft.schema.mjs";
// after
import { PlanDraftSchema as CORE_PLAN_DRAFT_SCHEMA } from "@lvstudio/core";
```

Remove any `@ts-expect-error` left by Task 1.4.

- [ ] **Step 4: Update the sensor in the same commit**

`scripts/check-planner-schema-boundary.mjs` currently asserts the deep relative import exists (it would now fail). Update it to assert the new invariants: the orchestrator imports `PlanDraftSchema` from `"@lvstudio/core"`, does not inline `PLAN_DRAFT_SCHEMA = {`, and `packages/core/src/schemas/plan-draft.schema.ts` still derives via `z.toJSONSchema` from `plan-draft.zod` (adjust the file paths and the required-substring checks in the script accordingly — keep its structure, change the strings).

- [ ] **Step 5: Verify and commit**

```bash
pnpm -s verify
git add -u
git commit -m "refactor(core): expose plan-draft schema through package index, drop deep import

check-planner-schema-boundary updated in the same change to pin the new
import path instead of the old relative one.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2 — In-process workflows instead of CLI subprocesses

Studio currently shells out via `studio-ops.mjs` → `spawn("pnpm", ["lvstudio", ...])`, and the root `lvstudio` script runs `pnpm -s build` **on every invocation**. Replace command-by-command with imported functions. `packages/mcp-server/src/index.ts` (lines 1–25 for imports, lines 441–680 for usage) is the reference wiring — mirror it, don't reinvent it.

**Inventory of subprocess commands** (from grep of `runLvstudio` call sites in `lib/`):

| CLI command                            | In-process replacement                                      | Port order                    |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `sync <id>`                            | `syncProject(projectId)` from `@lvstudio/core`              | 1                             |
| `check <id>` / `review <id>`           | `runQualityChecks(projectId)` from `@lvstudio/quality`      | 2                             |
| `create <id> --mode --platform`        | `createProjectScaffold(id, mode, platform)` from core       | 3                             |
| `render <id> --quality draft --force`  | `runRenderWorkflow(input, deps)` from `@lvstudio/workflows` | 4                             |
| `captions <id>`                        | `generateCaptionsForProject(...)` from core                 | 5                             |
| `transcribe <id> --provider`           | `transcribeProject(...)` + `transcriptionProviders`         | 6                             |
| `generate:tts <id> --provider --force` | `generateTTSForProject(...)` + `ttsProviders`               | 7 (env-coupled, see Task 2.4) |
| `direct:voice <id>`                    | core `direct-voice` module                                  | 7 (env-coupled, see Task 2.4) |

### Task 2.1: Create the domain-ops module

**Files:**

- Create: `apps/studio/lib/runtime/domain-ops.mts`
- Create: `apps/studio/test/domain-ops.test.mts`
- Modify: `apps/studio/package.json` (add `@lvstudio/quality`, `@lvstudio/workflows`, `@lvstudio/providers` workspace deps)

- [ ] **Step 1: Read the real signatures first**

Before writing the module, read `packages/mcp-server/src/index.ts` (how it constructs `deps` and calls each function) and the signatures in `packages/core/src/sync-project.ts`, `packages/core/src/project-service.ts`, `packages/quality/src/index.ts`, `packages/workflows/src/render-workflow.ts`. **Check how each function resolves the project root** — the MCP server resolves `path.resolve(process.cwd(), "content", "projects")`, i.e. it is cwd-dependent. The studio server computes `rootDir` explicitly in `server.mts`. If core functions take a root/paths argument (`getProjectPaths`), thread `rootDir` through; if they assume cwd, the studio process already runs from repo root, but write a test that pins this assumption (run a domain op against a temp project under an explicit root, per the "tests own a temporary project root" rule).

- [ ] **Step 2: Write the failing test**

`apps/studio/test/domain-ops.test.mts` — at minimum:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainOps } from "../lib/runtime/domain-ops.mjs";

test("createDomainOps exposes the ported operations", () => {
  const ops = createDomainOps({ rootDir: "/tmp/fake-root", log: async () => {} });
  assert.equal(typeof ops.syncProject, "function");
  assert.equal(typeof ops.runQualityChecks, "function");
});

test("every op logs an entry with op name, ok flag, and duration", async () => {
  const entries: unknown[] = [];
  const ops = createDomainOps({
    rootDir: "/tmp/fake-root",
    log: async (entry) => {
      entries.push(entry);
    },
    overrides: { syncProject: async () => ({ timeline: [], issues: [] }) },
  });
  await ops.syncProject("demo");
  assert.equal(entries.length, 1);
  assert.match(JSON.stringify(entries[0]), /"op":"syncProject"/);
});
```

Run: `pnpm --filter @lvstudio/studio test` — expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `domain-ops.mts`**

Shape (adjust call signatures to what Step 1 found — that is the point of Step 1):

```ts
import {
  createProjectScaffold,
  generateCaptionsForProject,
  syncProject as coreSyncProject,
  transcribeProject,
  validateProject,
  buildRenderBundle,
  getProjectPaths,
} from "@lvstudio/core";
import { runQualityChecks, runQualityChecksForBundle } from "@lvstudio/quality";
import { runRenderWorkflow } from "@lvstudio/workflows";
import { rendererProviders, transcriptionProviders } from "@lvstudio/providers";

export interface DomainOpsLogEntry {
  op: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface DomainOpsDeps {
  rootDir: string;
  log: (entry: DomainOpsLogEntry) => Promise<void>;
  /** test seam: replace individual ops without subprocess fakery */
  overrides?: Partial<DomainOps>;
}

export type DomainOps = ReturnType<typeof createDomainOps>;

export function createDomainOps({ rootDir, log, overrides = {} }: DomainOpsDeps) {
  function logged<A extends unknown[], R>(op: string, fn: (...args: A) => Promise<R>) {
    return async (...args: A): Promise<R> => {
      const startedAt = Date.now();
      try {
        const result = await fn(...args);
        await log({ op, ok: true, durationMs: Date.now() - startedAt });
        return result;
      } catch (error) {
        await log({
          op,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }

  const ops = {
    syncProject: logged("syncProject", (projectId: string) => coreSyncProject(projectId)),
    runQualityChecks: logged("runQualityChecks", (projectId: string) =>
      runQualityChecks(projectId),
    ),
    // createProject, renderDraft, generateCaptions, transcribe added per port task
  };

  return { ...ops, ...overrides };
}
```

The `log` injection preserves the existing observable behavior: `studio-ops.mjs` currently appends every command to a command log (`appendCommandLog`); wire the same sink in (`.studio-data` command log), so operators lose nothing when the subprocess goes away. The `overrides` seam replaces the current `runLvstudioTestMode`/`studioTestMode` mechanism for tests — keep `studio-testmode-ops` behavior equivalent (read it before porting; tests in `studio-routes-behavior.test.mjs` depend on it).

- [ ] **Step 4: Run tests, then verify**

`pnpm --filter @lvstudio/studio test` — expected: PASS. Then `pnpm -s verify`.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/lib/runtime/domain-ops.mts apps/studio/test/domain-ops.test.mts apps/studio/package.json pnpm-lock.yaml
git commit -m "feat(studio): add in-process domain ops with command logging and test seam

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 2.2: Port read-only and idempotent commands (sync, check/review, create)

**Files:**

- Modify: `apps/studio/lib/runtime/studio-runtime-wiring.mts` (or wherever `runLvstudio` is threaded into deps — find with `grep -rn "createStudioOps" apps/studio/lib`)
- Modify: call sites in `lib/project/project-ops.mts`, `lib/project/project-read-ops.mts`, `lib/routes/routes-projects-crud.mts`, `lib/routes/routes-projects-plan.mts`
- Modify: their tests

- [ ] **Step 1:** Wire `createDomainOps` into the runtime dependencies next to (not replacing) `createStudioOps`. Expose `domainOps` through the API context for the routes that need it (this adds context keys — update `studio-routes-deps.test` and `studio-api-context.test` in the same change, per the route-context contract rule).
- [ ] **Step 2:** Port one command at a time, in table order. For each: change the call site from `runLvstudio(["sync", projectId])` to `await domainOps.syncProject(projectId)`, adapt the result mapping (structured object instead of `{stdout, stderr}` — check what each caller actually does with stdout; several only check for non-throw), update the test, run that test file, commit. One commit per command:
  - `refactor(studio): sync runs in-process via domain ops`
  - `refactor(studio): quality checks run in-process via domain ops`
  - `refactor(studio): project create runs in-process via domain ops`
- [ ] **Step 3:** After all three: `pnpm -s verify` plus the live smoke: `pnpm studio` in background, create a scratch project via `curl -X POST localhost:3333/api/projects ...` (find the exact route in `routes-projects-crud.mts`), confirm sync/check endpoints respond, kill server, delete the scratch project directory.

### Task 2.3: Port render and captions

- [ ] **Step 1:** Render: replace `runLvstudio(["render", projectId, "--quality", "draft", "--force"])` with `runRenderWorkflow` — copy the deps object literally from `packages/mcp-server/src/index.ts` `lvstudio_render_project` case (lines 506–536): `buildRenderBundle`, `getProjectPaths`, `runQualityChecksForBundle`, `syncProject`, `validateProject`, `rendererProviders`. Map the `blocked` status to the same HTTP error the route returned before (read the current call site first to preserve the response contract — the web SPA consumes it).
- [ ] **Step 2:** Captions: same recipe with `generateCaptionsForProject`.
- [ ] **Step 3:** `pnpm -s verify` + render smoke: `pnpm smoke` (the root script renders the demo project end-to-end). Commit per command as in Task 2.2.

### Task 2.4: Decide tts/transcribe/direct:voice (env-coupled — read before porting)

The subprocess path injects voice settings as env vars (`voiceSettingsEnv(settings)` merged into the child env, consumed in core via `core-runtime-env.ts`). In-process calls can't do per-call env injection without mutating global `process.env`.

- [ ] **Step 1:** Read `packages/core/src/core-runtime-env.ts`, `packages/core/src/generate-tts.ts`, and `apps/studio/voice-settings.mjs`(`.mts`) to determine whether `generateTTSForProject` already accepts an options object that can carry these values.
- [ ] **Step 2 (decision rule):**
  - If core entry points accept (or can trivially accept) an explicit options parameter: add the parameter in core, default it from `core-runtime-env` so the CLI path is unchanged, cover with a core test, then port studio's tts/transcribe/direct:voice call sites like Task 2.2.
  - If threading the config requires restructuring core's TTS pipeline: **stop, do not port these three commands.** Keep them on `runLvstudio`, and record the residue in `AGENTS.md` under "Known debt" (one line: tts/voice commands still shell out pending explicit config threading; see this plan).
- [ ] **Step 3:** Whichever branch was taken: if all commands are ported, delete `createStudioOps`' subprocess machinery and `lvstudio-draft-runner.mts`'s spawn path if unused (`grep -rn "runLvstudio" apps/studio` must come back empty outside test-mode shims before deleting); update `check:studio`-adjacent tests. If commands remain, leave `studio-ops` in place. `pnpm -s verify`, commit.

---

## Phase 3 — Regroup the route context into capability objects

`routes-jobs` alone declares 28 flat string keys, mixing real capabilities (`runDraftJob`) with primitives (`path`, `process`, `readFile`, `sha256`). Group them so the contract test asserts capabilities, not a grab bag.

### Task 3.1: Define the grouped context

**Files:**

- Create: `apps/studio/lib/routes/route-capabilities.mts`
- Modify: `apps/studio/lib/runtime/studio-api-context.mts`, `apps/studio/lib/routes/studio-routes.mts`, all `routes-*.mts`, `apps/studio/test/studio-routes-deps.test.*`, `apps/studio/test/studio-api-context.test.*`

- [ ] **Step 1: Write the capability interfaces** in `route-capabilities.mts`, derived from the union of the existing `*_ROUTE_KEYS` lists (read all of them first — `routes-settings`, `routes-projects*`, `routes-assets`, `routes-jobs`). Target grouping:

```ts
export interface HttpCapability {
  sendJson: /* existing fn type */;
  parseJsonBody: /* ... */;
  parseBinaryBody: /* ... */;
}
export interface FsCapability {
  path: typeof import("node:path");
  readFile: /* ... */;
  writeFile: /* ... */;
  mkdir: /* ... */;
  sha256: /* ... */;
  safeReadJson: /* ... */;
  projectsDir: string;
}
export interface JobsCapability {
  listDraftJobs: /* ... */; activeDraftJobs: /* ... */; jobProgress: /* ... */;
  isDraftJobRunning: /* ... */; writeDraftJobState: /* ... */; runDraftJob: /* ... */;
  runTrackedForegroundJob: /* ... */; activeBeatJobs: /* ... */;
  beatJobProgress: /* ... */; runBeatRegenerateJob: /* ... */;
}
export interface TracesCapability {
  readRunTrace: /* ... */; appendRunTrace: /* ... */;
  readRunState: /* ... */; writeRunState: /* ... */;
}
export interface ProjectOpsCapability { /* getProjectDetails, runProjectMutation, domainOps, ... */ }
export interface VoiceSettingsCapability { /* readVoiceSettings, writeVoiceSettings, previewVoice, readTtsHealth, ... */ }

export interface RouteContext {
  http: HttpCapability;
  fs: FsCapability;
  jobs: JobsCapability;
  traces: TracesCapability;
  projectOps: ProjectOpsCapability;
  voiceSettings: VoiceSettingsCapability;
}
```

Fill the `/* ... */` types from the actual implementations during the task — every member must come from an existing key; if a key fits no group, that is a finding (e.g. `process` in JOB_ROUTE_KEYS — replace its single use with an injected narrower function rather than carrying the global through).

- [ ] **Step 2: Migrate one route module per commit**, smallest first (`routes-settings` → `routes-assets` → `routes-projects-*` → `routes-jobs`): change the handler to destructure from grouped context, replace its `*_ROUTE_KEYS` array with a typed `Pick<RouteContext, ...>` declaration, update `requireRouteContext`/`pickRouteContext` to walk groups, and update the two contract tests to assert group membership instead of flat keys. Each commit: route module + context plumbing + tests green (`pnpm --filter @lvstudio/studio test`).
- [ ] **Step 3:** When all route modules are migrated, delete the flat `STUDIO_ROUTE_CONTEXT_KEYS` path from `studio-api-context.mts`. `pnpm -s verify`. Final commit: `refactor(studio): route context grouped into typed capabilities`.

---

## Phase 4 — Fold env-boundary greps into ESLint (independent; can run before or in parallel with Phases 1–3)

Two of the ten `check:*` scripts are ripgrep-with-allowlist wrappers that ESLint expresses natively, with editor feedback instead of verify-time failure. Keep the others (`check-studio-server-bootstrap`, `check-test-dist-contract`, `check-renderer-boundary`, `check-planner-schema-boundary`, `check-video-plan-normalization`, `check-focused-audit-doc`, `check-agent-harness-docs`) — they check line counts, file relationships, and doc/script drift that lint cannot.

### Task 4.1: Replace `check:studio-env-boundary` and `check:core-env-boundary`

**Files:**

- Modify: `eslint.config.js`, `package.json` (root), `AGENTS.md`
- Delete: `scripts/check-studio-env-boundary.mjs`, `scripts/check-core-env-boundary.mjs`

- [ ] **Step 1: Add scoped `no-restricted-syntax` blocks to `eslint.config.js`**

```js
// ── Boundary: no direct process.env reads in studio orchestration ──────────
// (replaces scripts/check-studio-env-boundary.mjs; thread config through
// studio-runtime-config instead)
{
  files: ["apps/studio/lib/**/*.{mjs,mts}", "apps/studio/server.{mjs,mts}"],
  ignores: ["apps/studio/lib/runtime/studio-runtime-config.{mjs,mts}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "MemberExpression[object.object.name='process'][object.property.name='env']",
        message:
          "Do not read process.env in studio code. Thread config through studio-runtime-config.",
      },
    ],
  },
},
// ── Boundary: no direct LVSTUDIO_* env reads in core outside core-runtime-env ──
// (replaces scripts/check-core-env-boundary.mjs)
{
  files: ["packages/core/src/**/*.ts"],
  ignores: ["packages/core/src/core-runtime-env.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^LVSTUDIO_/]",
        message:
          "LVSTUDIO_* env reads belong in core-runtime-env.ts only.",
      },
    ],
  },
},
```

Before deleting anything, **prove equivalence**: temporarily introduce a violation in a studio lib file (`const x = process.env.FOO;`), run `pnpm lint`, confirm it errors; remove the violation. Do the same for a `process.env.LVSTUDIO_TTS_CONCURRENCY` read in a core file. The old studio script allowlisted `apps/studio/test/draft-flow-integration.test.mjs` — that file is under `test/`, which the new block doesn't match, so no carve-out is needed; verify with `pnpm lint`.

Note the old scripts also caught bare `env.LVSTUDIO_*` patterns (destructured env). If `pnpm lint` plus a grep audit (`rg "process\.env" apps/studio/lib packages/core/src`) shows destructured-env reads the selector misses, extend the selector rather than silently narrowing the sensor, e.g. add a second selector for `MemberExpression[object.name='env'][property.name=/^LVSTUDIO_/]` in core.

- [ ] **Step 2: Remove the scripts and their wiring — all in one commit**

1. `git rm scripts/check-studio-env-boundary.mjs scripts/check-core-env-boundary.mjs`
2. Root `package.json`: delete the two `check:*` script entries and remove both from the `verify` chain.
3. `AGENTS.md` line 17 (Boundary checks list): remove `studio-env-boundary` and `core-env-boundary` from the backtick list. **This is pinned by `scripts/check-agent-harness-docs.mjs`** (it fails if AGENTS.md lists a check that has no package.json script), so doc and scripts must change together.
4. Add one sentence to the AGENTS.md "Sensors over prose" section noting env boundaries are now ESLint rules in `eslint.config.js`.

- [ ] **Step 3: Verify and commit**

```bash
pnpm -s verify
git add -u
git commit -m "refactor(harness): enforce env boundaries via ESLint instead of grep scripts

Same invariants (no process.env in studio lib, LVSTUDIO_* reads only in
core-runtime-env), now with editor-time feedback. Equivalence proven by
injecting violations before deleting the scripts.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Out of scope (deliberately)

- Migrating the 50+ test files in `apps/studio/test/` to TypeScript — they keep working as `.mjs` under the tsx loader; migrate opportunistically when a test is touched for other reasons.
- Splitting `packages/core/src/sync-project.ts` (589 lines) — watch, don't extend; separate plan if it grows.
- Tightening planner quality gates back from warnings (AGENTS.md known debt) — separate concern.
- Renaming the repo/package/prefix (`scriptorium` / `local-video-studio` / `lvstudio`) — cosmetic.

## Risks and mitigations

- **`tsx` resolution differences vs plain Node** — mitigated by Task 1.1 Step 5 running the server and full test suite before any file is migrated, so loader problems surface with zero migration mixed in.
- **In-process domain calls change failure semantics** (a crash in a render no longer dies in a child process but in the server). `runRenderWorkflow` already runs in-process in the MCP server, so the blast radius is known; long-running work stays inside the existing runner modules which have failure/cancellation tests. Do not port a command without reading its runner's failure-path test first.
- **cwd-dependence in core project resolution** — explicitly checked in Task 2.1 Step 1 with a pinned test before any port.
- **Hidden consumers of `{stdout, stderr}` result shapes** — each port task requires reading what the caller does with stdout before swapping; routes that surfaced stdout to the SPA must keep their HTTP response contract.

## Final acceptance (after all phases)

```bash
pnpm -s verify          # full gate green
pnpm smoke              # demo project renders end-to-end
grep -rn "runLvstudio" apps/studio/lib | wc -l    # 0, or only the documented tts/voice residue from Task 2.4
find apps/studio/lib -name "*.mjs" | wc -l        # 0
```

Update `AGENTS.md`: the "Known debt" section's framing of studio (`.mjs`, subprocess CLI calls) is stale after this plan — rewrite those lines to reflect the typed, in-process reality, and note any Task 2.4 residue.
