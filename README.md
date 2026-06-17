# Scriptorium Video

Scriptorium Video is a TypeScript monorepo for planning, assembling, reviewing, and rendering narrated videos from structured project data. It combines a local Studio web app, a CLI, an MCP server, provider adapters, shared Zod domain schemas, and a Remotion renderer.

This is a personal engineering project. The repo is public for code review and portfolio use, not as a polished hosted product.

## What it demonstrates

- Monorepo architecture with clear package and app boundaries.
- Shared domain contracts built around canonical Zod schemas.
- Thin HTTP, CLI, and MCP adapters that delegate to named workflow modules.
- React 19 + Vite + TypeScript Studio UI with TanStack Query and focused component tests.
- Remotion rendering separated from orchestration and provider logic.
- Provider integrations for planning, image generation, transcription/TTS-style workflows, and local-first media flows.
- Structural guardrails, linting, formatting, type checks, and package-owned tests composed by one verification command.

## Workspace map

| Workspace             | Responsibility                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `packages/core`       | Domain schemas, validation, project paths, config resolution, and render-bundle contracts. |
| `packages/providers`  | Concrete provider adapters for external/local services.                                    |
| `packages/quality`    | Read-only quality checks and reports.                                                      |
| `packages/cli`        | Command-line interface wiring.                                                             |
| `packages/mcp-server` | MCP tools for project operations.                                                          |
| `apps/studio`         | Local HTTP server, workflow orchestration, job state, and the Studio web app.              |
| `apps/renderer`       | Remotion compositions and render-time presentation.                                        |

## Requirements

- Node.js 22
- pnpm 10.11.0
- Optional local services for full media generation, depending on provider settings
- Optional `ffmpeg` / `ffprobe` for smoke tests and rendered media inspection

## Quick start

```bash
pnpm install
pnpm start
```

`pnpm start` builds the packages, builds the web SPA, and launches the Studio server in one command. It defaults to `http://localhost:4173`.

The server autostarts the local Chatterbox TTS server on demand when a narration job runs. Chatterbox needs a one-time Python environment setup (Python 3.11, several GB of dependencies and model weights):

```bash
pnpm setup:chatterbox   # one time; re-run after a reboot if the venv lives under /private/tmp
```

For provider-backed flows (OpenAI planning/images/TTS), copy `.env.example` into your local shell or an ignored env file and provide the required credentials or local service URLs. Do not commit real secrets.

## Useful commands

```bash
pnpm -s verify
pnpm -s build
pnpm -s test
pnpm lint
pnpm format:check
pnpm mcp:server
```

`pnpm -s verify` is the main gate. It runs formatting checks, linting, TypeScript builds, package tests, Studio web tests, and boundary checks that keep orchestration, schemas, renderer code, and environment access in the right layers.

## Architecture notes

The main design constraint is that adapters should not become the application. Route handlers, CLI commands, MCP tools, and React components are expected to validate input, wire dependencies, call focused workflow/domain modules, and map the result back to their surface.

The repo enforces that through small modules and runnable checks:

- Renderer code stays out of core, CLI, and Studio orchestration.
- Planner and video-plan schemas are owned by `packages/core`.
- Studio environment reads are centralized in runtime config helpers.
- Tests that depend on built artifacts compile their package first.
- The Studio server entrypoint remains a bootstrap file instead of a business-logic container.

The durable agent/developer contract lives in `AGENTS.md`; it is included because this repo intentionally treats architecture guidance and mechanical checks as part of the engineering system.

## Current status

This project is active and local-first. It is suitable for reviewing architecture, testing strategy, frontend decomposition, workflow orchestration, and media-rendering boundaries. It is not yet packaged as a public npm library or deployed SaaS app.

Generated media, local Studio state, rendered outputs, captions, and per-project artifacts are intentionally ignored.
