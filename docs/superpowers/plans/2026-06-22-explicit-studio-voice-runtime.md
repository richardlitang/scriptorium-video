# Explicit Studio Voice Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Studio narration generation use an explicit, per-operation Chatterbox runtime configuration instead of passing voice settings through child-process environment variables.

**Architecture:** Keep environment-variable support as the CLI compatibility boundary in the providers package. Add an immutable Chatterbox runtime configuration that a caller can supply to a provider instance; request-level beat direction remains the highest-precedence source for provider options. Studio converts its normalized persisted voice settings into that configuration and invokes a typed narration operation, so route and draft job code no longer need `generate:tts` subprocess calls.

**Tech Stack:** TypeScript, Node.js, Zod-derived core contracts, node:test, pnpm workspaces.

## Global Constraints

- Preserve the already-merged Studio React/type-boundary work; do not merge the stale `studio-architecture-remediation` implementation.
- Keep CLI ambient-environment behavior backward compatible while making Studio's Chatterbox path explicit.
- Preserve `locked_by_user`, cache, beat voice-direction precedence, retry, trace, and foreground-job behavior.
- Do not weaken lint or quality gates; run `pnpm -s verify` before integration.
- Use a dedicated worktree and conventional commits with the required Claude co-author trailer.

---

## File Structure

- `packages/providers/src/tts/chatterbox-tts-provider.ts` owns Chatterbox runtime config normalization, explicit payload construction, explicit health probing, and the provider instance.
- `packages/providers/test/chatterbox-tts-provider.test.mjs` proves explicit config overrides ambient values without changing the CLI fallback.
- `apps/studio/lib/runtime/studio-voice-runtime.mts` converts normalized Studio voice settings and injected server configuration into a Chatterbox config; no process mutation is permitted.
- `packages/core/src/generate-tts.ts` accepts an explicit project root so Studio operations retain their scoped filesystem behavior without changing the process working directory.
- `apps/studio/lib/runtime/studio-domain-ops.mts` owns the typed `generateTts` operation and provider selection.
- `apps/studio/lib/runtime/studio-server-runtime-factory.mjs` composes the voice runtime and exposes the typed operation to existing route/job adapters.
- `apps/studio/lib/routes/routes-jobs.mjs`, `apps/studio/lib/draft/beat-regenerate-runner.mjs`, and `apps/studio/lib/draft/draft-audio-runner.mjs` call `domainOps.generateTts` and format its result; they keep only job/route concerns.
- `apps/studio/lib/runtime/studio-ops.mjs`, `apps/studio/lib/draft/lvstudio-draft-runner.mjs`, and subprocess-boundary tests lose `generate:tts` only after every Studio call site is migrated.

### Task 1: Add an explicit Chatterbox provider runtime configuration

**Files:**

- Modify: `packages/providers/src/tts/chatterbox-tts-provider.ts`
- Modify: `packages/providers/test/chatterbox-tts-provider.test.mjs`

**Interfaces:**

- Produces `type ChatterboxRuntimeConfig` with optional `speechUrl`, `apiKey`, `model`, `voiceId`, and provider-option fields.
- Produces `createChatterboxTTSProvider(config?, dependencies?)` and `checkChatterboxCapability(config?, fetchImpl?)`.
- Preserves `new ChatterboxTTSProvider()` and `buildPayload(request)` as compatibility APIs.

- [x] **Step 1: Write failing provider tests**

```js
test("explicit Chatterbox config wins over ambient configuration", async () => {
  const provider = createChatterboxTTSProvider(
    {
      speechUrl: "http://configured.test/v1/audio/speech",
      model: "configured-model",
      apiKey: "configured-key",
      exaggeration: 0.6,
    },
    { fetchImpl, probeMediaImpl },
  );
  await provider.synthesize(request);
  assert.equal(capturedUrl, "http://configured.test/v1/audio/speech");
  assert.equal(capturedHeaders.authorization, "Bearer configured-key");
  assert.equal(capturedPayload.model, "configured-model");
  assert.equal(capturedPayload.exaggeration, 0.6);
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter @lvstudio/providers test -- chatterbox-tts-provider`

Expected: FAIL because the explicit factory/configuration does not exist.

- [x] **Step 3: Implement immutable configuration resolution**

```ts
type ChatterboxRuntimeConfig = {
  speechUrl?: string;
  apiKey?: string;
  model?: string;
  voiceId?: string;
  audioPromptPath?: string;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
  seed?: number;
};

function resolveChatterboxConfig(
  config: ChatterboxRuntimeConfig = {},
): Required<Pick<ChatterboxRuntimeConfig, "speechUrl">> & ChatterboxRuntimeConfig {
  return { speechUrl: config.speechUrl ?? chatterboxUrl(), ...config };
}
```

Build a provider payload from `{ ...configProviderOptions, ...request.providerOptions }`, then keep request-level beat direction as the final override. The constructor/factory injects `fetch` and media probing for testability. The no-config constructor continues resolving environment variables exactly as today.

- [x] **Step 4: Run focused provider tests**

Run: `pnpm --filter @lvstudio/providers test -- chatterbox-tts-provider`

Expected: PASS, including existing ambient-environment tests.

- [x] **Step 5: Commit the provider slice**

```bash
git add packages/providers/src/tts/chatterbox-tts-provider.ts packages/providers/test/chatterbox-tts-provider.test.mjs
git commit -m "feat(providers): support explicit chatterbox runtime config" -m "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Task 2: Add a typed Studio narration operation

**Files:**

- Create: `apps/studio/lib/runtime/studio-voice-runtime.mts`
- Modify: `apps/studio/lib/runtime/studio-domain-ops.mts`
- Modify: `packages/core/src/generate-tts.ts`
- Modify: `apps/studio/test/studio-domain-ops.test.mts`
- Create: `apps/studio/test/studio-voice-runtime.test.mts`

**Interfaces:**

- Consumes `normalizeVoiceSettings()` output and `createChatterboxTTSProvider()`.
- Produces `voiceRuntimeForSettings(settings, processEnv): ChatterboxRuntimeConfig`.
- Produces `domainOps.generateTts({ projectId, providerId, force?, onlyBeat? })` returning `{ generated: string[]; skipped: string[] }`.

- [x] **Step 1: Write failing Studio unit tests**

```ts
test("voice runtime maps persisted settings without modifying process.env", () => {
  const runtime = voiceRuntimeForSettings(normalizeVoiceSettings({ ttsModel: "studio" }), {});
  assert.equal(runtime.model, "studio");
  assert.equal(runtime.exaggeration, 0.55);
});

test("domain narration uses the configured chatterbox provider", async () => {
  const result = await ops.generateTts({
    projectId: "demo",
    providerId: "chatterbox",
    force: true,
  });
  assert.deepEqual(result.generated, ["b1"]);
  assert.equal(capturedProviderConfig.model, "studio-model");
});
```

- [x] **Step 2: Run focused Studio tests and confirm they fail**

Run: `pnpm --filter @lvstudio/studio test -- studio-domain-ops studio-voice-runtime`

Expected: FAIL because the voice runtime and `generateTts` operation do not exist.

- [x] **Step 3: Implement the Studio conversion and domain operation**

```ts
export function voiceRuntimeForSettings(
  settings: VoiceSettings,
  processEnv: NodeJS.ProcessEnv,
): ChatterboxRuntimeConfig {
  return {
    speechUrl: processEnv.CHATTERBOX_TTS_URL,
    apiKey: processEnv.CHATTERBOX_TTS_API_KEY,
    model: settings.ttsModel,
    audioPromptPath: settings.audioPromptPath || undefined,
    exaggeration: settings.exaggeration,
    cfgWeight: settings.cfgWeight,
    temperature: settings.temperature,
    seed: settings.seed ? Number(settings.seed) : undefined,
  };
}
```

Add `rootDir?: string` to `GenerateTTSOptions` and pass it to `getProjectPaths(projectId, options.rootDir)`. Inject `readVoiceSettings` and a provider factory into `createStudioDomainOps`; for `chatterbox`, read settings once per operation and create the configured instance. Use the existing provider registry unchanged for all other provider IDs. Keep route/job formatting outside this module.

- [x] **Step 4: Run focused Studio tests**

Run: `pnpm --filter @lvstudio/studio test -- studio-domain-ops studio-voice-runtime`

Expected: PASS.

- [x] **Step 5: Commit the Studio domain slice**

```bash
git add apps/studio/lib/runtime/studio-voice-runtime.mts apps/studio/lib/runtime/studio-domain-ops.mts apps/studio/test/studio-domain-ops.test.mts apps/studio/test/studio-voice-runtime.test.mts
git commit -m "feat(studio): inject voice settings into narration operations" -m "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Task 3: Migrate foreground and beat narration from the subprocess bridge

**Files:**

- Modify: `apps/studio/lib/routes/routes-jobs.mjs`
- Modify: `apps/studio/lib/draft/beat-regenerate-runner.mjs`
- Modify: `apps/studio/test/studio-routes-behavior.test.mjs`
- Modify: `apps/studio/test/beat-regenerate-runner.test.mjs`
- Modify: `apps/studio/lib/runtime/studio-server-runtime-factory.mjs`

**Interfaces:**

- Consumes `domainOps.generateTts({ projectId, providerId, force, onlyBeat })`.
- Produces the current foreground-job/beat-job stdout shape using `JSON.stringify(result, null, 2)`.

- [x] **Step 1: Write failing adapter tests**

```js
assert.deepEqual(domainCalls.generateTts[0], {
  projectId: "demo",
  providerId: "chatterbox",
  force: true,
});
assert.equal(
  subprocessCalls.some(([command]) => command === "generate:tts"),
  false,
);
```

- [x] **Step 2: Run adapter tests and confirm failure**

Run: `pnpm --filter @lvstudio/studio test -- studio-routes-behavior beat-regenerate-runner`

Expected: FAIL because the routes still invoke `runLvstudio(["generate:tts", ...])`.

- [x] **Step 3: Replace only narration subprocess calls**

```js
await advance("Generating narration", async () => ({
  stdout: formatOutput(
    await domainOps.generateTts({ projectId, providerId: ttsProvider, force: true }),
  ),
}));
```

In beat regeneration pass `onlyBeat: beatId` and its existing `force` value. Do not migrate transcription or direct voice in this task.

- [x] **Step 4: Run focused adapter tests**

Run: `pnpm --filter @lvstudio/studio test -- studio-routes-behavior beat-regenerate-runner`

Expected: PASS.

- [x] **Step 5: Commit the adapter slice**

```bash
git add apps/studio/lib/routes/routes-jobs.mjs apps/studio/lib/draft/beat-regenerate-runner.mjs apps/studio/lib/runtime/studio-server-runtime-factory.mjs apps/studio/test/studio-routes-behavior.test.mjs apps/studio/test/beat-regenerate-runner.test.mjs
git commit -m "refactor(studio): run foreground narration through domain ops" -m "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Task 4: Migrate draft narration and tighten the subprocess boundary

**Files:**

- Modify: `apps/studio/lib/draft/draft-audio-runner.mjs`
- Modify: `apps/studio/lib/draft/lvstudio-draft-runner.mjs`
- Modify: `apps/studio/lib/runtime/studio-ops.mjs`
- Modify: `apps/studio/test/draft-audio-runner.test.mjs`
- Modify: `apps/studio/test/studio-subprocess-boundary.test.mjs`

**Interfaces:**

- Consumes `domainOps.generateTts({ projectId, providerId, onlyBeat, force: true })`.
- Leaves subprocess bridge allowlist as exactly `transcribe` and `direct:voice`.

- [x] **Step 1: Write the failing draft/boundary tests**

```js
assert.equal(domainCalls.generateTts.length, 2);
assert.equal(
  lvstudioArgs.some(([command]) => command === "generate:tts"),
  false,
);
assert.deepEqual(STUDIO_SUBPROCESS_COMMANDS, ["transcribe", "direct:voice"]);
```

- [x] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @lvstudio/studio test -- draft-audio-runner studio-subprocess-boundary`

Expected: FAIL because draft narration still delegates to `runLvstudioForDraft`.

- [x] **Step 3: Implement the draft migration**

```js
() =>
  domainOps.generateTts({
    projectId,
    providerId: provider,
    onlyBeat: beat.id,
    force: true,
  });
```

Wrap the result into the existing retry/progress output shape. Remove the now-unused draft TTS argument helper/imports, delete `generate:tts` from the subprocess allowlist, and adjust the structural boundary test so it rejects future `runLvstudio*(["generate:tts", ...])` usage.

- [x] **Step 4: Run focused tests**

Run: `pnpm --filter @lvstudio/studio test -- draft-audio-runner studio-subprocess-boundary`

Expected: PASS, with `transcribe` and `direct:voice` still allowed.

- [x] **Step 5: Commit the boundary slice**

```bash
git add apps/studio/lib/draft/draft-audio-runner.mjs apps/studio/lib/draft/lvstudio-draft-runner.mjs apps/studio/lib/runtime/studio-ops.mjs apps/studio/test/draft-audio-runner.test.mjs apps/studio/test/studio-subprocess-boundary.test.mjs
git commit -m "refactor(studio): remove narration subprocess bridge" -m "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Task 5: Verify, review, and integrate the completed slice

**Files:**

- Modify: `docs/superpowers/plans/2026-06-22-explicit-studio-voice-runtime.md`

- [x] **Step 1: Update completed checkboxes and inspect the diff**

Run: `git diff main...HEAD --check && git diff --stat main...HEAD`

Expected: no whitespace errors; only planned provider/Studio/test/plan files changed.

- [x] **Step 2: Run the full repository gate**

Run: `pnpm -s verify`

Expected: exit 0, no lint errors, and no more warnings than the documented baseline of 86 unless a warning is intentionally removed.

- [ ] **Step 3: Commit plan completion if its checkboxes changed**

```bash
git add docs/superpowers/plans/2026-06-22-explicit-studio-voice-runtime.md
git commit -m "docs(studio): record voice runtime verification" -m "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Merge the verified branch into main and push**

Run: `git switch main && git merge --no-ff codex/studio-hardening && git push origin main`

Expected: merge and push succeed without force-pushing.

## Review Notes

- The plan deliberately stops after narration. `transcribe` and `direct:voice` require separate explicit-runtime APIs because they have different credentials, cancellation, and output semantics; retaining their narrow allowlist prevents a broad, unsafe bridge.
- Task 2 keeps provider selection in the domain seam and uses dependency injection, so Studio does not mutate `process.env` and test cases can assert the concrete configuration.
- No warning budget is raised. The later warning-ratchet track begins only from this verified baseline.
