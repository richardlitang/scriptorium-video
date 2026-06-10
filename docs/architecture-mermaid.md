# Scriptorium Architecture Diagram

Generated: 2026-06-09
Scope: repository-level architecture for the local-first video production system.

Evidence read:

- `AGENTS.md`
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `packages/core/src/index.ts`
- `packages/core/src/render/build-render-bundle.ts`
- `packages/cli/src/index.ts`
- `packages/mcp-server/src/index.ts`
- `packages/providers/src/index.ts`
- `packages/quality/src/index.ts`
- `apps/studio/server.mjs`
- `apps/studio/lib/runtime/studio-runtime.mjs`
- `apps/studio/lib/runtime/studio-api-context.mjs`
- `apps/studio/lib/routes/studio-routes.mjs`
- `apps/studio/lib/routes/studio-http-handler.mjs`
- `apps/studio/web/src/api/client.ts`
- `apps/renderer/src/index.ts`
- `apps/renderer/src/Root.tsx`

## Inbound Adapters To Core

```mermaid
flowchart LR
  user["User / local operator"]
  web["Studio React UI\napps/studio/web"]
  studioServer["Studio HTTP server\napps/studio/server.mjs"]
  studioRoutes["Studio API routes\napps/studio/lib/routes"]
  studioRuntime["Studio runtime + ops\napps/studio/lib/runtime"]
  cli["lvstudio CLI\npackages/cli"]
  mcp["lvstudio MCP server\npackages/mcp-server"]
  core["Core domain + workflows\npackages/core"]
  schemas["Canonical Zod schemas\npackages/core/src/schemas"]
  quality["Quality checks\npackages/quality"]
  projectFiles["Local project files\ncontent/projects/project-id"]
  studioState["Studio local state\n.studio-data"]

  user --> web
  web --> studioServer
  studioServer --> studioRoutes
  studioRoutes --> studioRuntime
  studioRuntime --> cli

  user --> cli
  user --> mcp

  studioRuntime --> core
  cli --> core
  mcp --> core
  core --> schemas
  core --> projectFiles
  cli --> quality
  mcp --> quality
  quality --> core
  studioRuntime --> studioState

  classDef adapter fill:#E3F2FD,stroke:#1565C0,color:#0D47A1
  classDef coreLayer fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20
  classDef state fill:#F3E5F5,stroke:#7B1FA2,color:#4A148C

  class web,studioServer,studioRoutes,studioRuntime,cli,mcp adapter
  class core,schemas,quality coreLayer
  class projectFiles,studioState state
```

## Core To Providers And Output

```mermaid
flowchart LR
  core["Core domain + workflows\npackages/core"]
  renderBundle["Render bundle builder\npackages/core/src/render"]
  projectFiles["Local project files\ncontent/projects/project-id"]
  quality["Quality checks\npackages/quality"]
  providers["Provider adapters\npackages/providers"]
  rendererProvider["Remotion renderer provider\npackages/providers/src/renderer"]
  ttsProviders["TTS providers\nmanual / Chatterbox / MMS / OpenAI"]
  transcriptionProviders["Transcription providers\nmanual / mock"]
  renderer["Remotion compositions\napps/renderer"]
  output["Rendered media\nproject renders"]
  external["External/local services\nOpenAI / TTS servers / ffmpeg"]

  quality --> core
  core --> renderBundle
  core --> projectFiles
  core --> providers
  renderBundle --> renderer
  providers --> rendererProvider
  providers --> ttsProviders
  providers --> transcriptionProviders
  rendererProvider --> renderer
  rendererProvider --> output
  ttsProviders --> external
  transcriptionProviders --> external
  renderer --> output


  classDef coreLayer fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20
  classDef provider fill:#FFF3E0,stroke:#EF6C00,color:#E65100
  classDef state fill:#F3E5F5,stroke:#7B1FA2,color:#4A148C
  classDef render fill:#FCE4EC,stroke:#AD1457,color:#880E4F
  classDef external fill:#ECEFF1,stroke:#455A64,color:#263238

  class core,renderBundle,quality coreLayer
  class providers,rendererProvider,ttsProviders,transcriptionProviders provider
  class projectFiles state
  class renderer,output render
  class external external
```

## Primary Render Flow

```mermaid
sequenceDiagram
  participant User as User
  participant Surface as CLI / MCP / Studio
  participant Core as @lvstudio/core
  participant Quality as @lvstudio/quality
  participant Providers as @lvstudio/providers
  participant Renderer as apps/renderer
  participant Files as Local project files

  User->>Surface: render project
  Surface->>Core: validateProject(projectId)
  Surface->>Core: syncProject(projectId)
  Core->>Files: write timeline and resolved artifacts
  Surface->>Quality: runQualityChecks(projectId)
  Quality->>Core: buildRenderBundle(projectId)
  Core->>Files: load plan, manifest, timeline, captions
  Core-->>Quality: checked render bundle
  Surface->>Core: buildRenderBundle(projectId)
  Core-->>Surface: RenderBundle
  Surface->>Providers: renderer provider render
  Providers->>Renderer: Remotion render with renderBundle
  Renderer-->>Providers: media output
  Providers->>Files: write render file
  Providers-->>Surface: render result
  Surface-->>User: status / output path
```

## Notes

- Explicit: `packages/cli` and `packages/mcp-server` import core workflows, provider registries, and quality checks directly.
- Explicit: Studio serves the React app, builds a runtime, routes API requests through focused route modules, and delegates operations through runtime/context dependencies.
- Explicit: `packages/core` exports canonical schemas, project operations, sync, TTS/transcription workflow interfaces, quality repair planning, and render-bundle construction.
- Explicit: `apps/renderer` imports `RenderBundle` as a type and registers Remotion compositions; it consumes prepared props rather than owning project orchestration.
- Inferred: the Studio UI is shown as the browser surface for Studio API routes because `apps/studio/web/src/api/client.ts` defines the route calls and `apps/studio/server.mjs` serves the SPA bundle.
- Inferred: provider-facing flow is shown as a separate view because the all-in-one graph created unnecessary crossing edges around the core/provider cluster.
- Unknown: exact deployed external service topology is environment-dependent; provider adapters can target local services or external APIs based on configuration.

## Review Notes

- The main architectural risk is any future change that moves workflow logic back into adapters (`server.mjs`, route handlers, CLI command bodies, MCP tool cases, or React render code).
- The repo already counters that risk with boundary checks such as `check:studio-server-bootstrap`, `check:renderer-boundary`, `check:studio-env-boundary`, and schema-focused checks in `pnpm -s verify`.
