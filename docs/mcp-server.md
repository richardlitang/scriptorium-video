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
