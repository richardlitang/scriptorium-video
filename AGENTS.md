# Local Video Studio Agent Guide

Use MCP tools first for operational workflows.

## Preferred Control Surface

- Prefer `lvstudio_*` MCP tools over ad-hoc shell commands for project operations.
- Use MCP tools for:
  - create/list/status
  - validate/resolve-config/sync
  - quality checks
  - render
  - tts/transcribe/captions/media import

## Artifact Rules

- Do not edit generated artifacts directly unless asked:
  - `asset-manifest.json`
  - `timeline.json`
  - `captions/captions.json`
  - `captions/transcript.json`
- Respect `locked_by_user` artifacts unless `force: true` is explicitly provided.

## Workflow Boundary

- Keep workflow logic in `packages/core`.
- Keep renderer-specific logic in providers/apps renderer layers.
- Do not import Remotion in `packages/core` or `packages/cli`.

## Failure Handling

- If a render fails, inspect structured MCP result payloads first.
- Avoid bypassing validation/sync/check flow unless explicitly requested.

## Execution Defaults

- On every run, surface important realizations as they emerge:
  - architecture constraints
  - pattern drift
  - risky coupling
  - behavior that may regress later
- If unsure, do not generate new assets/artifacts/jobs speculatively. Pause generation and clarify first.
