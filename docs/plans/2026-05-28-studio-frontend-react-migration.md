# Studio Frontend: React + Vite + TanStack Query Migration

## Context

`apps/studio/public/` is the one part of this otherwise well-decomposed repo that is still a god-file: `app.js` (1,838 lines) is hand-written DOM wiring + `fetch` + polling + render functions, plus `beat-workspace.js` (607). The backend, `packages/*`, and the renderer are clean, typed, sensor-guarded and should not be touched.

The UI is workflow- and server-state-heavy (jobs, polling, draft states queued/running/failed/stale/completed, plan editing, image coverage), which is exactly the case a component framework + a server-state cache solve. A secondary goal is portfolio quality: the repo should read as a modern, consistently-typed codebase.

**Decision:** migrate the Studio browser UI to **React 19 + Vite + TypeScript + TanStack Query**, styled with **Tailwind + Radix primitives**. Incremental strangler — not a big-bang rewrite. React 19 is already in the repo via Remotion in `apps/renderer`.

**Non-goals:** no changes to `packages/*`, `apps/renderer`, the HTTP API, the MCP server, or Node server business logic. The only backend change is teaching the server to serve the built SPA.

## Key accelerator: reuse the pure view-models

These modules are already extracted with passing tests — import into React unchanged, convert to TS in the slice that touches them:

- `public/modules/story-ui-state.js`
- `public/modules/story-draft-state.js`
- `public/modules/tts-ui-state.js`
- `public/modules/draft-job-ui-state.js`
- `public/modules/draft-job-notification.js`
- `public/modules/draft-job-request.js`
- `public/modules/image-coverage-stats.js`
- `public/modules/image-coverage.js`
- `public/modules/project-storage.js`

The migration replaces DOM wiring, not this logic.

## Server-state surface (TanStack Query endpoints)

From `fetch` calls in `app.js` (helper `fetchJson` at `app.js:324`):

**Queries:**

- `GET /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/:id/assets`
- `GET /api/projects/:id/jobs`
- `GET /api/projects/:id/jobs/:jobId/trace`
- `GET /api/projects/:id/quality-history`
- `GET /api/projects/:id/renders`
- `GET /api/projects/:id/image-history`
- `GET /api/tts/health` (polled every ~5s, `app.js:1830`)
- `GET /api/planner-defaults`

**Polled query:** `GET /api/projects/:id/draft-job` (2.5s interval, `app.js:1191`) → `refetchInterval` in TanStack Query

**Mutations:**

- `POST /api/projects/:id/plan-from-story`
- `PUT /api/projects/:id/plan`
- `POST /api/projects/:id/generate-images`
- `POST /api/projects/:id/direct-voice`
- `POST /api/projects/:id/render`
- `POST /api/projects/:id/draft-job`
- `POST /api/projects/:id/draft-job/stop`
- Project CRUD

**Media:** served at `/api/projects/:id/media/...`

## Implementation Plan

### Phase 0 — Tooling (no behavior change)

1. Create `apps/studio/web/` Vite app (React + TS + Tailwind + Radix)
2. Add deps to `apps/studio/package.json`: `react`, `react-dom`, `@tanstack/react-query`, `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `@radix-ui/*`, `vitest`, `@testing-library/react`, `jsdom`
3. `web/vite.config.ts`: dev server proxies `/api/*` → Node studio server; `build.outDir = ../web/dist`
4. Scripts: `dev` (vite), `build:web` (vite build), `test:web` (vitest)
5. Server: extend `static-assets.mjs` to serve `web/dist` when it exists (SPA fallback to `index.html`), else fall back to legacy `public/`. Legacy UI stays intact until cutover.

### Phase 1 — Foundation slice

6. `web/src/api/client.ts`: typed wrapper over the endpoint surface above (port `fetchJson` semantics)
7. `web/src/main.tsx`: React root, `QueryClientProvider`, Tailwind base, layout shell
8. **Slice 1 — project list/selection**: `useProjects()` query + sidebar; selecting a project drives app state. Proves the full stack end-to-end.

### Phase 2–N — Strangle panel by panel

Each slice: build the React panel → reach parity → delete that section from `app.js`. Convert consumed pure module(s) to `.ts` in the same slice.

| Slice | Panel                                                              | Reused modules                                                      |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 2     | TTS health pill (polled `refetchInterval`)                         | `tts-ui-state`                                                      |
| 3     | Story → plan composer (story input + controls + `plan-from-story`) | `story-ui-state`, `story-draft-state`                               |
| 4     | Plan editor + save + quality/timeline/captions output              | —                                                                   |
| 5     | Draft job: prepare/render-draft/stop + job banner + poll           | `draft-job-ui-state`, `draft-job-notification`, `draft-job-request` |
| 6     | Job center + traces                                                | `job-center.js`                                                     |
| 7     | Images: generate, coverage, image-history, media preview           | `image-coverage*`                                                   |
| 8     | Beat workspace                                                     | `beat-workspace.js` (607 lines, largest)                            |
| 9     | Voice settings dialog (Radix Dialog)                               | `voice-settings-ui.js`                                              |
| 10    | Review list + remaining controls                                   | —                                                                   |

### Cutover

- When `app.js` is reduced to nothing: delete `public/app.js`, `public/index.html`, ported `public/modules/*`; make server serve `web/dist` by default.
- Replace `apps/studio/test/studio-ui-contract.test.mjs` (guards static HTML ids) with equivalent Vitest component tests. Until cutover it still guards the legacy DOM.

## Files Modified

- **New:** `apps/studio/web/` tree, `docs/plans/2026-05-28-studio-frontend-react-migration.md`
- **Modified:** `apps/studio/package.json`, `apps/studio/static-assets.mjs`, `apps/studio/AGENTS.md`, root `AGENTS.md` (Known debt), root `package.json` (verify scripts)
- **Per-slice:** shrink `public/app.js`, convert `public/modules/*.js` → `.ts`

## Verification

- **Per slice:** `pnpm --filter @lvstudio/studio test:web` + `pnpm -s verify`. Manual: `pnpm --filter @lvstudio/studio dev`, exercise ported panel, confirm parity.
- **Draft-job slice:** verify polling stops/starts and stale/cancel states behave.
- **Cutover:** `pnpm -s verify` green, `build:web` succeeds, `node apps/studio/server.mjs` serves SPA, smoke a story→plan→draft→render flow.

## Constraints

- No Redux/Zustand — TanStack Query + local `useState` is sufficient for a single-user local tool.
- Radix only where a real primitive is needed (Dialog, Slider, Select, etc.).
- No SSR — production serve is the static build from `web/dist`.
