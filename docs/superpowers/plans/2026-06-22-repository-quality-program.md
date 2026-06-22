# Repository Quality Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish canonical Studio contracts, eliminate known boundary drift, ratchet lint quality, and make every improvement independently mergeable.

**Architecture:** Read-only audits may run in parallel because they do not share mutable code. Implementations use one short-lived branch per workstream; schema, provider-runtime, Studio-domain, and web-client changes merge in dependency order. The root verification gate remains the sole integration authority.

**Tech Stack:** pnpm workspaces, TypeScript, React 19, TanStack Query, Zod, ESLint flat config, Node.js.

## Global Constraints

- Start every implementation workstream from current `main` in an ignored isolated worktree.
- Do not increase the current ESLint warning ceiling of 86; only lower it after removing warnings.
- Use `pnpm -s verify` before each merge; inspect the diff and stage explicit files only.
- Providers receive explicit runtime config; only CLI/bootstrap boundaries may read ambient environment.
- Studio components do not call `fetch`; use typed client functions and TanStack Query hooks.
- Keep one root `CLAUDE.md` pointer and one canonical `AGENTS.md` hierarchy.

---

## Parallel Audit Batch A (read-only)

### Task 1: ESLint rule-impact inventory

**Agent scope:** `eslint.config.js`, `package.json`, current lint output; no edits.

**Deliverable:** `docs/reports/2026-06-22-eslint-rule-impact.md` with each candidate rule, affected file count, error/warning recommendation, required dependency, and safe glob.

- [ ] Run `pnpm -s lint --format json` and classify findings by rule and package.
- [ ] Compare typed-rule candidates against `**/*.{ts,tsx,mts}` only; identify JS/config exclusions.
- [ ] Record whether `@eslint/js`, `typescript-eslint`, `eslint-plugin-n`, `eslint-plugin-regexp`, and `eslint-plugin-jsx-a11y` are needed.
- [ ] Commit only the report: `docs: inventory eslint rule impact`.

### Task 2: Frontend API/query inventory

**Agent scope:** `apps/studio/web/src/components`, `apps/studio/web/src/api`, `apps/studio/web/src/queries`; no edits.

**Deliverable:** `docs/reports/2026-06-22-studio-web-api-inventory.md` mapping every component-level network call to an existing or required client/query module.

- [ ] Search component files for `fetch(` and identify request method, endpoint, invalidations, error UI, and binary-response needs.
- [ ] Mark each call as query, mutation, or browser-only preview action.
- [ ] Define target module names under `web/src/api/` and `web/src/queries/` without proposing component redesign.
- [ ] Commit only the report: `docs: inventory studio web api calls`.

### Task 3: Runtime-config and duplicate-intent inventory

**Agent scope:** `packages/providers`, `packages/cli`, `apps/studio/lib/runtime`, `apps/studio/voice-settings.mjs`; no edits.

**Deliverable:** `docs/reports/2026-06-22-runtime-config-and-duplication.md` with ambient-env ownership and high-confidence duplicate contracts.

- [ ] Map `process.env` reads to bootstrap/CLI, provider adapter, or orchestration layers.
- [ ] Identify the canonical owner for voice settings, direct voice request/response parsing, and provider configuration.
- [ ] Flag only semantic duplicates with shared behavior and test coverage; do not recommend utility consolidation merely by similar names.
- [ ] Commit only the report: `docs: inventory runtime config and duplicate intents`.

## Serial Implementation Workstreams

### Task 4: Simplify agent guidance

**Files:**

- Modify: `AGENTS.md`, `apps/*/AGENTS.md`, `packages/*/AGENTS.md`
- Keep: `CLAUDE.md`

**Outcome:** Root guidance owns universal rules; nested files contain only local ownership/boundary/test differences.

- [ ] Remove repeated nested tooling-baseline paragraphs that merely point to root guidance.
- [ ] Replace the stale Studio “migration in progress” heading with the current SPA-only state.
- [ ] Preserve every unique package restriction and the root Claude compatibility pointer.
- [ ] Run `pnpm -s check:agent-harness-docs` and `pnpm -s format:check`.
- [ ] Commit `docs: simplify agent guidance hierarchy`; merge and delete branch after review.

### Task 5: Create canonical voice settings contract

**Files:**

- Modify: `apps/studio/voice-settings.mjs`, `apps/studio/lib/runtime/studio-voice-runtime.mts`
- Modify: `apps/studio/web/src/components/VoiceSettingsDialog.tsx`
- Create or modify: a shared typed contract exported from Studio’s canonical settings module
- Test: `apps/studio/test/voice-settings.test.mjs`, `apps/studio/test/studio-voice-runtime.test.mts`, relevant web test

**Interfaces:**

```ts
type VoiceSettings = ReturnType<typeof normalizeVoiceSettings>;
const defaultVoiceSettings: VoiceSettings;
function normalizeVoiceSettings(input: unknown): VoiceSettings;
```

- [ ] Write a failing test proving UI defaults and server normalization derive from the same exported source.
- [ ] Replace the UI-local `VoiceSettings` interface/default object with imports from the canonical contract or a generated API type.
- [ ] Retain UI-only preset selection as presentation policy; pass selections through canonical normalization before save/preview.
- [ ] Run Studio unit, web, and full verification.
- [ ] Commit `refactor(studio): centralize voice settings contract`; merge and delete branch.

### Task 6: Move Studio component networking into typed API/query modules

**Files:**

- Modify: `apps/studio/web/src/api/client.ts`
- Create: focused API/query modules for voice settings, direct voice, and beat regeneration
- Modify: `VoiceSettingsDialog.tsx`, `DraftControls.tsx`, `BeatWorkspace.tsx`, `ReviewPanel.tsx`
- Test: new API/query tests plus affected component tests

**Interfaces:**

```ts
export async function updateVoiceSettings(settings: VoiceSettings): Promise<VoiceSettings>;
export function useDirectVoiceMutation(projectId: string): UseMutationResult<...>;
export function useBeatRegenerationMutation(projectId: string): UseMutationResult<...>;
```

- [ ] Write failing tests that component actions invoke mutations/client methods rather than global `fetch`.
- [ ] Add typed client functions with response-envelope validation and consistent error mapping.
- [ ] Add TanStack Query hooks with exact invalidation keys for project details, jobs, and draft-job status.
- [ ] Preserve preview cancellation and object-URL cleanup in a focused hook; do not force binary audio through JSON query caching.
- [ ] Add a scoped lint/sensor rule forbidding `fetch` in `web/src/components/**` except an explicitly documented component-free hook if needed.
- [ ] Run web tests and `pnpm -s verify`.
- [ ] Commit `refactor(studio-web): centralize api mutations`; merge and delete branch.

### Task 7: Complete typed Studio operations and remove subprocess residue

**Files:**

- Modify: `apps/studio/lib/runtime/studio-domain-ops.mts`, route/job runners, `packages/core`, `packages/cli`
- Modify or delete: `apps/studio/lib/draft/lvstudio-draft-runner.mjs`, unreachable test-mode command handlers
- Test: Studio route/domain/subprocess tests and relevant core/CLI tests

**Interfaces:**

```ts
domainOps.transcribe({ projectId, providerId }): Promise<TranscriptionResult>;
domainOps.directVoice({ projectId, input }): Promise<VoiceDirectionResult>;
```

- [ ] Write failing route and domain tests showing direct voice/transcription use typed operations, not `runLvstudio`.
- [ ] Extract direct-voice request parsing and OpenAI client configuration from CLI into a typed, injected operation.
- [ ] Add typed transcription provider selection with explicit root/config dependencies.
- [ ] Delete commands from the allowlist only after every production caller is migrated; remove dead test-mode branches.
- [ ] Run focused tests, then `pnpm -s verify`.
- [ ] Commit `refactor(studio): remove remaining voice subprocess bridge`; merge and delete branch.

### Task 8: Finish explicit provider runtime configuration

**Files:**

- Modify: `packages/providers/src/tts/mms-tts-provider.ts`, `openai-tts-provider.ts`, renderer adapter(s)
- Modify: `packages/cli/src/generate-tts.ts`, direct-voice bootstrap/config module
- Test: provider tests and CLI routing tests

- [ ] Write failing provider tests proving supplied config overrides ambient values while no-config CLI compatibility remains.
- [ ] Introduce provider-specific immutable config types and factories accepting injected fetch/process dependencies.
- [ ] Make CLI/config bootstrap resolve environment once and pass config to provider factories.
- [ ] Keep provider request-level options higher precedence than operation defaults.
- [ ] Run provider/CLI tests and `pnpm -s verify`.
- [ ] Commit `refactor(providers): inject runtime configuration`; merge and delete branch.

### Task 9: Apply the ESLint ratchet and architecture sensors

**Inputs:** Tasks 1–8 reports and merged contracts.

- [ ] Add only approved lint dependencies and retain Prettier last in the flat config.
- [ ] Scope type-aware rules to `**/*.{ts,tsx,mts}` and explicitly disable them for JS/config files.
- [ ] Add `no-duplicate-imports`, `prefer-const`, TypeScript `no-shadow`, exhaustive-switch checks, and unnecessary-assertion checks one rule at a time with remediation commits.
- [ ] Add component-fetch architecture enforcement after Task 6 is green.
- [ ] Add Node sync/regex rules only to confirmed runtime globs after the audit demonstrates no false-positive class.
- [ ] Lower `--max-warnings` only to the actual post-cleanup count.
- [ ] Run `pnpm -s verify`; commit `chore(lint): ratchet correctness rules`; merge and delete branch.

### Task 10: Decompose verified hotspots and professionalize delivery

**Inputs:** hotspot/duplicate evidence; no speculative extractions.

- [ ] Select at most one hotspot per branch: MCP dispatch, Studio runtime factory, job routes, quality runner, or one oversized React component.
- [ ] For each extraction, write pure-function tests before moving code and retain adapter-only entrypoints.
- [ ] Add HTTP/MCP contract tests for any moved operation.
- [ ] Document release/versioning and smoke-artifact expectations in `docs/`.
- [ ] Confirm GitHub’s existing `Verify` workflow is required for `main`; if this cannot be managed in-repo, record the exact repository-settings action in release documentation.
- [ ] Run `pnpm -s verify` per branch; merge and delete each branch separately.

## Integration Checklist

- [ ] Review each agent report and reject unsupported consolidation claims.
- [ ] Ensure no two agent branches modify the same shared contract before integration.
- [ ] Before every merge: `git diff main...HEAD --check`, `pnpm -s verify`, and explicit-file staging.
- [ ] After every merge: push `main`, remove the merged branch/worktree, and record the remaining warning count.
