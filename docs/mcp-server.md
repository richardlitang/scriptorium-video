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
- `lvstudio_generate_tts`
- `lvstudio_transcribe_project`
- `lvstudio_generate_captions`
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
