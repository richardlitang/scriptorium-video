# Feature: Local Video Studio Milestone 1

## Goal

Build the first renderer-agnostic vertical slice: validate a local project, compile a timeline, and render `content/projects/demo/renders/draft.mp4` through a Remotion renderer adapter.

## Current Resume State

Last updated: 2026-05-17

Status:

- Scaffold files have been created.
- Demo project JSON and demo SVG visual have been created.
- Demo WAV voice asset has been generated with `ffmpeg`.
- The first scaffold currently calls Remotion from `packages/cli/src/render-remotion.ts`; this must be corrected before continuing.
- `pnpm install` was requested but interrupted before completion.
- No successful dependency install, typecheck, sync, or render has been verified yet.

Resume from:

```bash
Task 2: Correct Renderer Boundary
```

Do not run `pnpm install` until Task 2 is complete.

## Architecture Overview

Milestone 1 keeps business logic in `packages/core`, command orchestration in `packages/cli`, and presentation-only video rendering in `apps/renderer`. The product is renderer-agnostic at the engine boundary: core loads validated project artifacts, builds a normalized `RenderBundle`, and command/control adapters select a `RendererProvider` and call `renderer.render(...)`.

Remotion is the first and only V1 renderer implementation, but the app must not become “a Remotion app.” Remotion-specific APIs belong only in the Remotion renderer adapter and `apps/renderer`.

No model APIs, TTS services, transcription services, stock media services, database, or UI should be added in this milestone.

`buildRenderBundle(projectId)` belongs in `packages/core`, not `packages/cli`. Bundle construction is a repeatable workflow primitive needed by the CLI, future MCP server, future UI, test runner, job queue, and future API. Keep `syncProject` separate from `buildRenderBundle`: sync computes and writes `timeline.json`; bundle building loads, validates, resolves config, checks staleness, and returns normalized render input.

Milestone 1 does not implement real quality gates. The render command should use this temporary flow:

```txt
render -> validate -> sync unless --no-sync -> buildRenderBundle -> render
```

Milestone 6 will insert quality gates:

```txt
render -> validate -> sync unless --no-sync -> buildRenderBundle -> check -> render
```

MCP stays after quality gates. It should wrap stable core workflows later, not become an early second orchestration surface while sync/render/check are still moving.

## Renderer-Agnostic Rule

The core engine must produce normalized render data. Renderer adapters may consume that bundle differently, but no core package may import Remotion APIs.

Renderer-independent:

- `video-plan.json`
- `asset-manifest.json`
- `timeline.json`
- `captions.json`
- mode configs
- platform configs
- style packs
- quality gates
- provider interfaces
- caption grouping
- sync/timing engine
- asset hashing/caching

Renderer-specific:

- `apps/renderer/`
- `packages/providers/src/renderer/remotion/`

Allowed dependency direction:

```txt
packages/core       -> no Remotion imports
packages/captions   -> core only
packages/quality    -> core only
packages/providers  -> core types + provider-specific SDKs
packages/cli        -> core + providers
apps/renderer       -> Remotion + core types
```

Forbidden:

- Timing calculation inside Remotion components
- Caption grouping inside React render code
- Asset selection policy inside Remotion templates
- Quality checks depending on Remotion internals
- CLI importing `@remotion/*` directly
- Renderer adapters loading or parsing project-control JSON files directly

Renderer adapters may read media files referenced by paths in the bundle, because they need those files to render. They must not independently read or parse:

- `project.json`
- `video-plan.json`
- `asset-manifest.json`
- `timeline.json`
- `captions.json`
- mode config
- platform config
- style pack config

## Tech Stack

- TypeScript
- Zod
- Commander
- Remotion
- FFmpeg/ffprobe
- pnpm workspaces
- Local JSON files and filesystem assets

## Files Already Created

Workspace:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`
- `.gitignore`

Core:

- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/src/index.ts`
- `packages/core/src/config-resolver.ts`
- `packages/core/src/hash.ts`
- `packages/core/src/json.ts`
- `packages/core/src/media-probe.ts`
- `packages/core/src/paths.ts`
- `packages/core/src/project-service.ts`
- `packages/core/src/renderer-props.ts`
- `packages/core/src/sync-project.ts`
- `packages/core/src/schemas/project.schema.ts`
- `packages/core/src/schemas/video-plan.schema.ts`
- `packages/core/src/schemas/asset-manifest.schema.ts`
- `packages/core/src/schemas/timeline.schema.ts`
- `packages/core/src/schemas/captions.schema.ts`

CLI:

- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/create-project.ts`
- `packages/cli/src/render-remotion.ts` (temporary; must be moved/replaced by Task 2)

Providers:

- Not created yet.

Renderer:

- `apps/renderer/package.json`
- `apps/renderer/tsconfig.json`
- `apps/renderer/src/index.ts`
- `apps/renderer/src/Root.tsx`
- `apps/renderer/src/components/CaptionLayer.tsx`
- `apps/renderer/src/components/MediaLayer.tsx`
- `apps/renderer/src/templates/VerticalStoryTemplate.tsx`

Config and demo content:

- `modes/short-story.json`
- `modes/long-documentary.json`
- `platforms/local-only.json`
- `platforms/youtube.json`
- `platforms/youtube-shorts.json`
- `stylepacks/default.json`
- `export-profiles/shorts-1080x1920.json`
- `content/projects/demo/project.json`
- `content/projects/demo/video-plan.json`
- `content/projects/demo/asset-manifest.json`
- `content/projects/demo/captions/captions.json`
- `content/projects/demo/assets/images/intro-001.svg`
- `content/projects/demo/assets/audio/voice/intro-001.wav`

## Tasks

### Task 1: Confirm Working Tree Context

**Files:** none

**Action:** Inspect

```bash
pwd
ls -la
rg --files -g '!*node_modules*'
```

**Verify:**

- `pwd` is `/Users/richardlitang/code/personal/scriptorium`.
- The files listed above exist.

**Commit:** none

---

### Task 2: Correct Renderer Boundary

**Files:**

- Add: `packages/core/src/renderer-provider.ts`
- Add: `packages/core/src/render/build-render-bundle.ts`
- Modify: `packages/core/src/index.ts`
- Add: `packages/providers/package.json`
- Add: `packages/providers/tsconfig.json`
- Add: `packages/providers/src/index.ts`
- Add: `packages/providers/src/renderer/registry.ts`
- Add: `packages/providers/src/renderer/remotion/remotion-renderer.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`
- Delete: `packages/cli/src/render-remotion.ts`
- Modify: `tsconfig.json`

**Action:** Move Remotion-specific rendering out of the CLI and behind a renderer provider.

Add the provider contract in `packages/core/src/renderer-provider.ts`:

```ts
import type { AssetManifest } from "./schemas/asset-manifest.schema.js";
import type { CaptionsFile } from "./schemas/captions.schema.js";
import type { Project } from "./schemas/project.schema.js";
import type { Timeline } from "./schemas/timeline.schema.js";
import type { VideoPlan } from "./schemas/video-plan.schema.js";

export type RendererCapabilities = {
  supportsPreview: boolean;
  supportsPartialRender: boolean;
  supportsAlpha: boolean;
  supportsAudioMixing: boolean;
  supportedTemplates: string[];
};

export type ResolvedRenderConfig = {
  fps: number;
  aspectRatio: "9:16" | "9:16" | "1:1";
  resolution: {
    width: number;
    height: number;
  };
  templateId: string;
  targetDurationSeconds?: number;
};

export type RenderBundle = {
  project: Project;
  videoPlan: VideoPlan;
  assetManifest: AssetManifest;
  timeline: Timeline;
  captions?: CaptionsFile;
  resolvedConfig: ResolvedRenderConfig;
};

export type RenderRequest = {
  projectDir: string;
  renderBundle: RenderBundle;
  outputPath: string;
  quality: "draft" | "final";
};

export type RenderResult = {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  providerId: string;
};

export interface RendererProvider {
  id: string;
  capabilities: RendererCapabilities;
  render(request: RenderRequest): Promise<RenderResult>;
}
```

Create `packages/core/src/render/build-render-bundle.ts`:

```ts
import { hashFile } from "../hash.js";
import { getProjectPaths } from "../paths.js";
import { loadProject } from "../project-service.js";
import { resolveConfig } from "../config-resolver.js";
import type { RenderBundle } from "../renderer-provider.js";

export async function buildRenderBundle(input: {
  projectId: string;
  rootDir?: string;
}): Promise<RenderBundle> {
  const rootDir = input.rootDir ?? process.cwd();
  const paths = getProjectPaths(input.projectId, rootDir);
  const loaded = await loadProject(input.projectId, rootDir);

  if (!loaded.timeline) {
    throw new Error("timeline.json is required. Run sync before building a render bundle.");
  }

  const currentPlanHash = await hashFile(paths.videoPlan);
  if (loaded.timeline.sourcePlanHash !== currentPlanHash) {
    throw new Error("timeline.json is stale. Run sync before rendering.");
  }

  return {
    project: loaded.project,
    videoPlan: loaded.videoPlan,
    assetManifest: loaded.assetManifest,
    timeline: loaded.timeline,
    captions: loaded.captions,
    resolvedConfig: await resolveConfig(loaded.videoPlan, rootDir),
  };
}
```

Export provider and bundle helpers from `packages/core/src/index.ts`:

```ts
export * from "./renderer-provider.js";
export * from "./render/build-render-bundle.js";
```

Create `packages/providers/package.json`:

```json
{
  "name": "@lvstudio/providers",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@lvstudio/core": "workspace:*"
  },
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Create `packages/providers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/providers/src/renderer/remotion/remotion-renderer.ts` by moving the current logic from `packages/cli/src/render-remotion.ts` into a `RemotionRenderer` class:

```ts
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RendererProvider, RenderRequest, RenderResult } from "@lvstudio/core";

type RemotionInputProps = {
  renderBundle: RenderRequest["renderBundle"];
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};

export class RemotionRenderer implements RendererProvider {
  id = "remotion";

  capabilities = {
    supportsPreview: false,
    supportsPartialRender: false,
    supportsAlpha: false,
    supportsAudioMixing: true,
    supportedTemplates: ["vertical-story"],
  };

  async render(request: RenderRequest): Promise<RenderResult> {
    const assetUrls = Object.fromEntries(
      request.renderBundle.assetManifest.assets.map((asset) => [
        asset.id,
        pathToFileURL(path.resolve(request.projectDir, asset.path)).href,
      ]),
    );

    const inputProps: RemotionInputProps = {
      renderBundle: request.renderBundle,
      quality: request.quality,
      assetUrls,
    };

    const serveUrl = await bundle({
      entryPoint: path.resolve(process.cwd(), "apps", "renderer", "src", "index.ts"),
    });

    const composition = await selectComposition({
      serveUrl,
      id: request.renderBundle.resolvedConfig.templateId,
      inputProps,
    });

    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: request.outputPath,
      inputProps,
    });

    return {
      outputPath: request.outputPath,
      durationSeconds: request.renderBundle.timeline.durationSeconds,
      width: request.renderBundle.timeline.width,
      height: request.renderBundle.timeline.height,
      fps: request.renderBundle.timeline.fps,
      providerId: this.id,
    };
  }
}
```

Create `packages/providers/src/renderer/registry.ts`:

```ts
import type { RendererProvider } from "@lvstudio/core";
import { RemotionRenderer } from "./remotion/remotion-renderer.js";

export const rendererProviders: Record<string, RendererProvider> = {
  remotion: new RemotionRenderer(),
};
```

Create `packages/providers/src/index.ts`:

```ts
export * from "./renderer/registry.js";
export * from "./renderer/remotion/remotion-renderer.js";
```

Modify `packages/cli/package.json` so it depends on providers:

```json
"dependencies": {
  "@lvstudio/core": "workspace:*",
  "@lvstudio/providers": "workspace:*"
}
```

Modify `packages/cli/src/index.ts` so the render command:

1. Runs `syncProject` unless `--no-sync`.
2. Calls `buildRenderBundle({ projectId })`.
3. Looks up `rendererProviders[bundle.videoPlan.providers.renderer]`.
4. Calls `renderer.render(...)`.

The CLI must not import `@remotion/bundler`, `@remotion/renderer`, or any Remotion-specific file.

The renderer adapter must not read project-control JSON from disk. It receives all control data through `RenderRequest.renderBundle`. It may read referenced media files through paths from `assetManifest`.

Modify `apps/renderer/src/Root.tsx` and `apps/renderer/src/templates/VerticalStoryTemplate.tsx` to accept Remotion input props shaped as:

```ts
type RemotionInputProps = {
  renderBundle: RenderBundle;
  quality: "draft" | "final";
  assetUrls: Record<string, string>;
};
```

Modify root `tsconfig.json` references:

```json
{ "path": "packages/providers" }
```

Delete `packages/cli/src/render-remotion.ts` after the provider adapter compiles.

**Verify:**

```bash
rg '@remotion' packages/core packages/cli
```

Expected:

- No matches.

```bash
rg '@remotion' packages/providers apps/renderer
```

Expected:

- Matches only in provider adapter and renderer app.

**Commit:** none

---

### Task 3: Install Dependencies

**Files:**

- Creates: `node_modules/`
- Creates: `pnpm-lock.yaml`

**Action:** Install

```bash
pnpm install
```

**Expected:**

- Install completes successfully.
- `pnpm-lock.yaml` exists.

**If blocked by DNS/network sandbox:**

Request escalation and rerun:

```bash
pnpm install
```

**Commit:** none

---

### Task 4: Typecheck the Workspace

**Files:** existing TypeScript files

**Action:** Verify

```bash
pnpm build
```

**Expected:**

- TypeScript build succeeds.

**If it fails:**

- Fix only the reported type/module errors.
- Do not add features.
- Rerun `pnpm build`.

**Commit:** none

---

### Task 5: Validate Demo Project

**Files:**

- Reads: `content/projects/demo/project.json`
- Reads: `content/projects/demo/video-plan.json`
- Reads: `content/projects/demo/asset-manifest.json`
- Reads: `content/projects/demo/captions/captions.json`

**Action:** Verify

```bash
pnpm lvstudio validate demo
```

**Expected:**

```txt
Project demo is valid.
```

**If it fails:**

- Fix only malformed schema data or schema import/runtime issues.
- Keep persisted JSON strict.

**Commit:** none

---

### Task 6: Resolve Demo Config

**Files:**

- Reads: `modes/short-story.json`
- Reads: `platforms/local-only.json`
- Reads: `stylepacks/default.json`

**Action:** Verify

```bash
pnpm lvstudio resolve-config demo
```

**Expected:**

- Output includes:
  - `"fps": 30`
  - `"width": 1080`
  - `"height": 1920`
  - `"templateId": "vertical-story"`

**If it fails:**

- Fix `packages/core/src/config-resolver.ts`.
- Keep config hierarchy: base defaults -> mode -> platform -> style pack -> project overrides.

**Commit:** none

---

### Task 7: Sync Demo Timeline

**Files:**

- Reads: `content/projects/demo/video-plan.json`
- Reads/writes: `content/projects/demo/asset-manifest.json`
- Writes: `content/projects/demo/timeline.json`

**Action:** Verify

```bash
pnpm lvstudio sync demo
```

**Expected:**

```txt
Synced demo: 1 segments, 6.00s.
```

Also verify:

```bash
cat content/projects/demo/timeline.json
```

Expected timeline properties:

- `schemaVersion` is `1`
- `fps` is `30`
- `width` is `1080`
- `height` is `1920`
- `durationSeconds` is about `6`
- first segment has `beatId: "intro-001"`
- first segment has `voiceAssetId: "voice-intro-001"`
- first segment has `mediaAssetIds: ["image-intro-001"]`

**If it fails:**

- Fix only `packages/core/src/sync-project.ts`, schema imports, or demo JSON.
- Do not implement Milestone 2 probing sophistication beyond what is needed for the demo.

**Commit:** none

---

### Task 8: Render Demo Draft

**Files:**

- Reads renderer files under `apps/renderer/src/`
- Reads project artifacts under `content/projects/demo/`
- Writes: `content/projects/demo/renders/draft.mp4`

**Action:** Verify

```bash
pnpm lvstudio render demo --quality draft
```

**Expected:**

- Command completes.
- `content/projects/demo/renders/draft.mp4` exists.

Verify with ffprobe:

```bash
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 content/projects/demo/renders/draft.mp4
```

Expected:

- Duration is about `6`.

**If it fails:**

- Fix Remotion wiring in `packages/providers/src/renderer/remotion/remotion-renderer.ts` or `apps/renderer/src/*`.
- Keep templates presentation-only.
- Do not move timing logic into React components.

**Commit:** none

---

### Task 9: Add a Smoke Test Script

**Files:**

- Modify: `package.json`

**Action:** Add a script:

```json
"smoke": "pnpm lvstudio validate demo && pnpm lvstudio sync demo && pnpm lvstudio render demo --quality draft"
```

**Verify:**

```bash
pnpm smoke
```

Expected:

- Validates.
- Syncs.
- Renders draft MP4.

**Commit:** none

---

### Task 10: Review Generated Files for Scope

**Files:** all changed files

**Action:** Inspect

```bash
rg --files -g '!*node_modules*'
```

Check:

- No provider integrations were added.
- No cloud or external model API code exists.
- `packages/core` and `packages/cli` have no Remotion imports.
- `packages/cli` calls `buildRenderBundle` instead of duplicating bundle construction.
- No computed timing was written into `video-plan.json`.
- `timeline.json` is the computed render truth.
- `asset-manifest.json` tracks manual assets.

**Commit:** none

---

### Task 11: Initialize Git If Needed

**Files:**

- Creates: `.git/`

**Action:** Only run if this directory is still not a git repository:

```bash
git status --short
```

If it says this is not a git repository:

```bash
git init
```

Then inspect:

```bash
git status --short
```

**Commit:** none

---

### Task 12: Commit Milestone 1 Skeleton

**Files:** stage specific milestone files

**Action:** Stage specific files, not `git add -A`.

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json .gitignore
git add packages/core packages/cli packages/providers apps/renderer
git add modes platforms stylepacks export-profiles
git add content/projects/demo
git add docs/plans/2026-05-17-local-video-studio-milestone-1.md
git status --short
```

Commit:

```bash
git commit -m "feat(lvstudio): scaffold renderer-agnostic milestone" -m "Builds the local JSON project skeleton, validation, sync, provider-based rendering, and Remotion adapter for the demo project." -m "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Expected:**

- Commit succeeds.

---

## Milestone 1 Done Criteria

All must be true:

- `pnpm install` completed.
- `pnpm build` passed.
- `pnpm lvstudio validate demo` passed.
- `pnpm lvstudio sync demo` wrote a valid `timeline.json`.
- `pnpm lvstudio render demo --quality draft` wrote `content/projects/demo/renders/draft.mp4`.
- `ffprobe` confirms the rendered video duration is about 6 seconds.
- `packages/core` has no Remotion imports.
- `packages/cli` has no Remotion imports.
- Remotion code lives only in `packages/providers/src/renderer/remotion/` and `apps/renderer/`.
- No model/provider integrations were added.
- A conventional commit records the milestone.

## Next Milestone After This

Milestone 2 should add real asset-manifest writing and stronger ffprobe-based probing. Do not start it until Milestone 1 is verified and committed.

Later MCP work should call the same core workflow functions, including `buildRenderBundle`, rather than reading project JSON or duplicating render orchestration inside MCP handlers.
