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

- On every run, surface important realizations as they emerge.
- Realizations must focus on improvement opportunities, not just observations:
  - architecture: boundaries, ownership, coupling, data flow, fallback strategy
  - code quality: complexity hotspots, duplication, weak validation/defaulting, test gaps
  - patterns: inconsistency with existing conventions, missing abstractions, unsafe shortcuts
  - design/UX: workflow friction, unclear controls, poor defaults, weak feedback states
- Each realization should include:
  - `problem`: what is weak or likely to fail later
  - `impact`: why it matters (quality, speed, reliability, cost)
  - `improvement`: concrete change to implement next
- If unsure, do not generate new assets/artifacts/jobs speculatively. Pause generation and clarify first.
- Before ending a run, include a short `Realizations` section in the handoff when any of the above is detected.

## Autonomy Mode

- Default behavior is end-to-end autonomous execution unless the user specifies a boundary.
- `go` means continue through all remaining slices in the current objective, not a fixed batch size.
- Do not stop between slices unless a critical blocker is hit:
  - destructive action not explicitly requested
  - required permission/escalation
  - missing credentials/secrets required to proceed
  - conflicting requirements that materially change behavior
  - failing checks that cannot be fixed safely in this run
