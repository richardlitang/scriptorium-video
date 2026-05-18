# Feature: Chatterbox TTS Provider

## Goal
Use Chatterbox for higher-quality local voiceover generation without forcing Apple Silicon users through Docker for model inference.

## Architecture Overview
Add a `chatterbox` TTS provider that talks to an OpenAI-compatible local HTTP service. Keep Chatterbox runtime choices outside the TypeScript app so it can run through host Python, a tuned local server, or a remote GPU endpoint.

## Tasks

### Task 1: Add Chatterbox provider
**Files:** `packages/providers/src/tts/chatterbox-tts-provider.ts`
**Action:** Create an HTTP TTS provider that writes returned audio bytes and probes duration.
**Verify:** `pnpm build`
**Commit:** `feat(tts): add chatterbox provider`

### Task 2: Register provider
**Files:** `packages/providers/src/tts/registry.ts`, `packages/providers/src/index.ts`
**Action:** Export and register `chatterbox`.
**Verify:** `pnpm build`
**Commit:** `feat(tts): register chatterbox provider`

### Task 3: Document Apple Silicon workflow
**Files:** `docs/chatterbox-tts.md`
**Action:** Document host-first Chatterbox setup, env vars, and quality defaults.
**Verify:** Manual doc review.
**Commit:** `docs(tts): document chatterbox workflow`

### Task 4: Default Studio drafts to Chatterbox
**Files:** `apps/studio/public/app.js`, `apps/studio/server.mjs`
**Action:** Keep OpenAI for planning/images, but set generated draft voiceover plans to Chatterbox.
**Verify:** `pnpm build`
**Commit:** `feat(studio): default voiceover drafts to chatterbox`

### Task 5: Add local Chatterbox server script
**Files:** `scripts/chatterbox_tts_server.py`
**Action:** Provide a host-local OpenAI-compatible server for Apple Silicon usage.
**Verify:** `python scripts/chatterbox_tts_server.py` and `/health`.
**Commit:** `feat(tts): add local chatterbox server`
