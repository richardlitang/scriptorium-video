# Local Video Studio — Agent Guide

This is the repo-level contract for both Claude Code and Codex. `CLAUDE.md` points here. Nested `AGENTS.md` files (`packages/*`, `apps/*`) refine ownership for each workspace — read the nested one for the area you are touching.

## Primary principle

**Do not let adapters become the application.** Servers wire routes, UI files wire controllers, components render, commands orchestrate, domain modules compute, configs declare policy, tests lock behavior. When you reach for a file to add logic, first decide which of those it is, and put the logic where it belongs — not wherever the call site happens to be.

This repo is already heavily decomposed (~70 modules in `apps/studio/lib/`, focused React modules under `apps/studio/web/`, per-module tests, boundary `check:*` scripts). The failure mode here is **not** under-structuring — it is re-thickening the few remaining god-files and bypassing the sensors. Keep new work boring and small.

## Sensors over prose

Correct behavior is enforced by runnable checks, not by this document. Prefer adding or tightening a sensor over adding more rules here.

- `pnpm -s verify` runs the full gate: `format:check`, `lint`, `tsc` builds, package `test` scripts, and the boundary checks below.
- Style/lint (run individually): `pnpm format` (Prettier write), `pnpm format:check` (CI check), `pnpm lint` (ESLint, zero errors required), `pnpm lint:fix` (auto-fix).
- Boundary checks (in `package.json`, run individually as `pnpm -s check:<name>`): `studio`, `renderer-boundary`, `test-dist-contract`, `studio-server-bootstrap`, `planner-schema-boundary`, `video-plan-normalization`, `studio-env-boundary`, `core-env-boundary`, `focused-audit-doc`, `agent-harness-docs`.
- When an agent mistake repeats, add or tighten a `check:*` script or a test instead of writing another paragraph here.
- **Zod types are canonical** — export named types from `packages/core/src/schemas` (`ScaleMode`, `SubjectPosition`, etc.) and import them everywhere. Do not redeclare inline string unions.
- **Run `/compact`** when a conversation has been running through large implementation tasks (React migrations, multi-file refactors) and more substantial work remains. Do not wait for 100% context usage.

Before claiming a code change is complete, run `pnpm -s verify` — unless the change is docs-only or the user set a narrower boundary. Never claim "passing" without showing the command output.

## Bootstrap Quality Tooling (Mandatory)

For any new repo/workspace/bootstrap in this project, set up linting and formatting at the start, not later.

- Required baseline:
  - One linter (`eslint` or `biome` or equivalent) with a repo script (`lint`).
  - One formatter (`prettier` or `biome format` or equivalent) with a repo script (`format`) and a check script (`format:check`).
  - CI must run lint + format check + tests/build (`pnpm -s verify` or equivalent composite gate).
- Prefer the smallest toolchain that matches the stack (e.g., Biome as single tool if it covers lint + format needs).
- Do not defer lint/format setup as “follow-up tech debt” on greenfield work.

## Package & app boundaries

| Workspace            | Owns                                                                        | Must not                                                                                  |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/core`      | domain model, Zod schemas, validation, project paths/ops, sync/build bundle | import Remotion; own provider/server/UI logic                                             |
| `packages/providers` | concrete provider adapters (TTS, image, etc.)                               | own workflow decisions                                                                    |
| `packages/quality`   | read-only audits and reports                                                | mutate projects                                                                           |
| `packages/cli`       | command parsing and wiring                                                  | import Remotion; hold workflow logic                                                      |
| `apps/studio`        | local HTTP server, browser UI, job orchestration, Studio adapters           | put business logic in `server.mjs` or React render bodies                                 |
| `apps/renderer`      | Remotion compositions, render-time presentation                             | own workflow/provider/server logic; read arbitrary project files (consume render bundles) |

The Remotion boundary and the studio server/env boundaries are enforced by `check:*` scripts — do not work around a failing boundary check, fix the placement.

## Source of truth

- Zod schemas in `packages/core/src/schemas` are the canonical domain model. Infer TypeScript types from them; do not hand-maintain a parallel type, JSON schema, and metadata object for the same contract.
- New planner/provider output uses canonical fields only. Legacy fields live only at load/migration boundaries, and any legacy path needs: a normalizer/migration, a review/quality warning that flags stale data, and a test proving canonical data wins.

## Thin adapters, named workflows

- Route handlers, MCP tool cases, button `onclick`s, polling callbacks, and render bodies should: validate input → call a named command/runner → map the result. They should not inline the workflow.
- Studio route behavior belongs in `lib/routes-*.mjs` delegating to focused `lib/` operations; long-running work belongs in an explicit runner module with tests for success, failure, and cancellation/stale state.
- Project writes go through the project mutation queue / existing serialized write path — never an ad-hoc write.
- Name state changes after domain events (`markDraftQueued`, `markRenderStale`), not after individual booleans. When several flags must stay consistent, use a reducer/transition helper rather than scattered boolean choreography.

## Policy, not magic numbers

Constants that encode product/visual/workflow/provider policy (crop damping, scale modes, quality thresholds, polling intervals, retry limits, provider/platform defaults) belong in named config maps, not inline ternaries. In the renderer, compute typed values, clamp/normalize, then stringify once — do not build CSS strings and regex-rewrite them.

## Runtime state & config

- Do not read `process.env` deep inside orchestration. Thread config through `studio-runtime-config.mjs` / a focused config helper; external clients accept injected `fetch`, URLs, timeouts, and credentials for testability.
- Every new env var: declare in the central config helper, document in `.env.example`, cover with the env/example test. The `studio-env-boundary` / `core-env-boundary` checks enforce this.

## Generated artifacts

Do not hand-edit generated artifacts unless explicitly asked: `asset-manifest.json`, `timeline.json`, `captions/captions.json`, `captions/transcript.json`. Respect `locked_by_user` artifacts unless `force: true` is explicitly provided. Studio tests/fixtures must not edit real project artifacts — own a temporary project root instead.

## Preferred control surface

Prefer `lvstudio_*` MCP tools over ad-hoc shell for project operations (create/list/status, validate/resolve-config/sync, quality checks, render, tts/transcribe/captions/media import). On render failure, read the structured MCP result payload first. Do not bypass the validate → sync → check → render flow unless explicitly asked.

## Testing & verification

- Each package/app owns its `test` script; `pnpm verify` composes them — do not grow root-level test globs.
- Route/server changes need a test exercising the route/context binding, not only pure helpers. The Studio API context is a contract: adding a route dependency means updating the route dependency test.
- Render/timeline/media changes need a test validating generated artifact structure or render-bundle behavior.
- Stable HTML ids are UI contracts (`studio-ui-contract.test.mjs`); renaming/removing one means updating that test. Tests reading static files resolve paths from `import.meta.url`, never `process.cwd()`.
- When extracting logic, add tests around the pure functions first (story parsing, plan construction, state transitions, render policy, provider selection, quality gates).

## Known debt — bias toward fixing, not extending

- The Studio browser UI migration is **complete** — the legacy vanilla UI files have been deleted. The SPA lives in `apps/studio/web/` (React 19 + Vite + TypeScript + TanStack Query + Tailwind + Radix). See `apps/studio/AGENTS.md` for the frontend stack and `docs/plans/2026-05-28-studio-frontend-react-migration.md` for the full record.
- The git history shows a long run of `fix(studio): ...` follow-up commits. Prefer one correct change behind a sensor over a fix-on-fix chain. If a class of regression keeps recurring, encode it as a `check:*` script.
- Planner quality gates were recently downgraded to warnings. Treat that as known debt; do not silently weaken a gate further to make output pass — surface it.

## Execution defaults & autonomy

- Default to end-to-end autonomous execution unless the user sets a boundary. `go` means continue through all remaining slices of the objective, not a fixed batch.
- Stop only on a real blocker: an unrequested destructive action, a needed permission/credential, conflicting requirements that change behavior, or failing checks that cannot be fixed safely this run.
- If unsure, do not speculatively generate assets/jobs — pause and clarify.
- Surface improvement-oriented realizations as they emerge (architecture/coupling, complexity & duplication, weak validation, test gaps, workflow friction), each as `problem` / `impact` / `improvement`. Include a short `Realizations` section in the handoff when any are found.

## Pre-commit checklist

1. Logic in the right layer; no adapter got thicker?
2. No duplicated schema/contract?
3. No new loose boolean that should be a named transition?
4. No policy buried in magic numbers?
5. No workflow/fetch/polling/provider/filesystem logic added directly to a handler, router, or UI file?
6. Tests added for newly extracted pure logic?
7. `pnpm -s verify` run, output confirmed green?
