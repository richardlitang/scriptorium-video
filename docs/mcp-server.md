# Local MCP Server

Start server:

```bash
pnpm mcp:server
```

The server exposes `lvstudio_*` tools over stdio.

## Implemented Tools

- `lvstudio_list_projects`
- `lvstudio_create_project`
- `lvstudio_get_project_status`
- `lvstudio_validate_project`
- `lvstudio_resolve_config`
- `lvstudio_sync_project`
- `lvstudio_run_quality_checks`
- `lvstudio_render_project`
- `lvstudio_start_render_job`
- `lvstudio_get_render_job`
- `lvstudio_cancel_render_job`
- `lvstudio_get_quality_report`
- `lvstudio_plan_quality_repairs`
- `lvstudio_generate_tts`
- `lvstudio_transcribe_project`
- `lvstudio_generate_captions`
- `lvstudio_prepare_draft_assets`
- `lvstudio_import_media`

## Result Envelope

All tools return:

```ts
type McpToolResult<T> = {
  ok: boolean;
  message: string;
  data?: T;
  warnings?: string[];
  errors?: Array<{
    code: string;
    message: string;
    path?: string;
  }>;
};
```

## Render Flow

`lvstudio_render_project` runs:

1. `validate`
2. `sync` (unless `noSync: true`)
3. `quality checks`
4. provider render

If quality status is `fail`, render is blocked unless `force: true`.

The current render tool is synchronous. It is acceptable for small/local runs, but it is not the long-term boundary for Studio-scale or agent-driven rendering because an MCP tool call should not block for a multi-minute video job.

Implemented async render tools:

1. `lvstudio_start_render_job` validates input, records a queued render job, and returns a job id immediately.
2. `lvstudio_get_render_job` returns structured job state, progress, quality status, output path when complete, and any terminal error.
3. `lvstudio_cancel_render_job` requests cancellation and returns the terminal or in-progress cancellation state.

Current runtime semantics:

- Render jobs are process-local to the MCP server instance.
- If the MCP server restarts, in-memory render jobs are lost; callers should treat missing jobs after restart as stale state and start a fresh render.
- Only one queued/running render job is allowed per project to avoid concurrent render races against the same project artifacts.
- Cancellation is best-effort. The workflow checks for cancellation between major stages and during progress callbacks; a provider that does not surface callback aborts may still finish its current render step before the job reaches a terminal cancelled state.

The synchronous `lvstudio_render_project` tool remains available as the small-run compatibility path, but job-based render is now the preferred automation surface.

## Repair Planning Flow

`lvstudio_plan_quality_repairs` runs quality checks and returns a non-mutating repair plan for known structured findings. The plan classifies deterministic actions such as `generate_tts`, `resolve_media`, `rewrite_narration`, `adjust_voice_direction`, and `adjust_editorial`.

Unknown error findings are returned as blocked findings so an agent or user can review them explicitly instead of silently applying an unsafe change.

## Draft Asset Flow

`lvstudio_prepare_draft_assets` runs the deterministic asset-prep sequence for an existing plan:

1. `validate`
2. `sync`
3. TTS generation
4. transcription
5. captions
6. quality checks

This tool intentionally does not call the Studio background draft planner. The Studio draft job is app-owned runtime orchestration; exposing it over MCP needs a shared workflow boundary or a Studio-owned MCP surface, not direct imports from `packages/mcp-server`.

The same rule applies to future draft-job MCP tools:

- `lvstudio_start_draft_job`
- `lvstudio_get_draft_job`
- `lvstudio_cancel_draft_job`

Those tools should bind to explicit job-state APIs rather than shelling out to Studio or importing app runtime internals into `packages/mcp-server`.
