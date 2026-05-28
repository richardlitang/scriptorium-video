# Studio Agent Guide

`apps/studio` owns the local HTTP server, browser UI, job orchestration, and Studio-specific adapters.

## Server Boundaries

- `server.mjs` is a composition/startup file. Do not add new business logic to it.
- New route behavior belongs in `lib/routes-*.mjs` and should delegate to focused operations in `lib/`.
- New long-running work belongs in an explicit runner module with tests for success, failure, cancellation/stale state where applicable.
- Project writes must use the project mutation queue or an existing serialized write path.
- Route dependencies must go through the Studio API context contract. When adding one, update the route dependency test.

## Runtime Config

- Do not read `process.env` deep inside orchestration code. Thread config through `studio-runtime-config.mjs` or a focused config helper.
- Any new env var must be added to `.env.example` and covered by `env-example.test.mjs`.
- External API clients should accept injected `fetch`, URLs, timeouts, and credentials for testability.

## Frontend Stack (React migration in progress)

The browser UI is being migrated from `public/app.js` (vanilla DOM) to `web/` (React 19 + Vite + TypeScript + TanStack Query + Tailwind + Radix). See `docs/plans/2026-05-28-studio-frontend-react-migration.md` for the full strangler plan.

**During migration (until `public/app.js` is gone):**
- Do not add new features or broad coordination logic to `public/app.js`. New panels go in `web/src/`.
- New UI state or behavior: `web/src/` for React components/queries; `public/modules/` only for pure logic that hasn't been ported yet.
- `public/modules/*.js` pure view-models are converted to `.ts` slice-by-slice as each panel is ported. Do it in the same slice, not as a separate cleanup.
- Stable HTML ids in `public/index.html` are still UI contracts until cutover (`studio-ui-contract.test.mjs`).

**React/Vite conventions:**
- All new web code lives under `web/src/`. Components in `web/src/components/`, queries/mutations in `web/src/queries/`, typed API wrapper at `web/src/api/client.ts`.
- Use TanStack Query for all server state (polls, mutations, invalidations). No `setInterval` or direct `fetch` in components.
- Use Radix primitives (Dialog, Select, Slider, etc.) for accessible interactive controls.
- Test with Vitest + Testing Library (`pnpm test:web`). Dev server: `pnpm dev` (proxies `/api` to the Node studio server on port 3333).
- `pnpm build:web` outputs to `web/dist`. The server auto-detects `web/dist/index.html` and serves the SPA (with fallback to `public/` if dist is absent).
- Tests that read static Studio files should resolve paths from `import.meta.url`, not `process.cwd()`.

## Generated Artifacts

- Do not edit generated project artifacts directly from Studio tests or fixtures unless a test explicitly owns a temporary project root.
