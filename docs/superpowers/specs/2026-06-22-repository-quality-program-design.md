# Repository Quality Program Design

## Goal

Raise Local Video Studio’s maintainability and architectural enforcement without a disruptive rewrite. Each completed workstream is independently verified, merged to `main`, and deleted before the next dependent change begins.

## Decisions

- Preserve the root `AGENTS.md` as the canonical agent contract; retain a single root `CLAUDE.md` compatibility pointer; remove only repeated nested boilerplate and stale migration language.
- Move durable concepts fully to their canonical boundary: voice settings, Studio web API calls, provider runtime configuration, and typed Studio operations.
- Keep local presentation/adaptor code local. Do not centralize helpers merely because they are short or similar.
- Use independent agents only for read-only audits and clearly non-overlapping implementation slices. Shared-contract migrations are sequential.
- `pnpm -s verify` is the integration gate for every code slice. Existing 86 lint warnings are a baseline to ratchet down, never raise.

## Workstreams and Dependency Order

1. **Agent guidance cleanup** — independent docs-only cleanup.
2. **Canonical voice settings** — establishes the shared schema/defaults used by later web and provider work.
3. **Studio web API/query migration** — depends on stable voice contracts; moves component fetches into typed client/query modules.
4. **Complete typed Studio operations** — moves direct voice and transcription off the subprocess bridge; depends on the provider/config seams.
5. **Explicit provider runtime config** — applies the Chatterbox pattern to MMS, OpenAI TTS, Remotion, and direct voice; coordinates with Workstream 4.
6. **ESLint ratchet and architectural sensors** — applies after migrations, so rules codify the intended architecture rather than merely report legacy code.
7. **Hotspot decomposition** — small targeted extractions from proven hotspots, selected only from audit evidence after earlier boundaries stabilize.
8. **Release and CI hardening** — records release process, required checks, and smoke-test artifacts.

## Parallel Audit Lanes

These are read-only and can run in parallel before implementation work:

- Lint-rule impact inventory: identify violations and safe per-glob rule scopes.
- Duplicate-intent inventory: cluster utilities/normalizers/formatters and recommend only tested consolidations.
- Frontend API inventory: map component `fetch` calls to existing/missing API client and TanStack Query modules.
- Runtime-config inventory: map ambient `process.env` reads to CLI, provider, and runtime configuration boundaries.

Audit reports are evidence, not automatic refactor authorization. Each implementation branch consumes only approved, scoped findings.

## Verification and Integration

- Every workstream begins from current `main` in an isolated worktree.
- Agent changes may not overlap files; the integration owner reviews every diff and reruns focused checks.
- A workstream merges only after `pnpm -s verify` succeeds on its branch.
- Main is pushed without force; merged local branches/worktrees are removed.
- If a workstream discovers a new cross-cutting contract, it stops and adds a follow-up design slice instead of expanding scope.

## Explicit Non-Goals

- No framework replacement or blanket `.mjs` to `.ts` migration.
- No arbitrary warning suppression or warning-budget increase.
- No broad “deduplicate everything” refactor.
- No parallel edits to canonical schemas or shared route/runtime composition.
