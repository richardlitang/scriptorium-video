# Local Video Studio Execution Checklist

Last updated: 2026-05-17

Use this as the resumable implementation tracker.

## Status Key
- `[x]` done
- `[~]` in progress / partial
- `[ ]` not started

## Milestones

1. `[x]` Milestone 1: Renderer-first vertical slice
- CLI create/validate/sync/render path works.
- Demo render output: `content/projects/demo/renders/draft.mp4`.

2. `[x]` Milestone 2: Renderer-agnostic boundary
- `RendererProvider`, `RenderBundle`, `RenderRequest`, `RenderResult` are in core.
- `buildRenderBundle(projectId)` is in core.
- CLI and MCP orchestrate through core; Remotion is isolated in providers/renderer + apps/renderer.

3. `[x]` Milestone 3: Asset manifest + sync probing
- `sync` re-probes assets and writes timeline.
- Stale/timing issues are surfaced in sync results.

4. `[x]` Milestone 4: TTS provider abstraction
- Provider interface + mock/manual providers.
- Per-beat generation, hash cache, lock-aware behavior.

5. `[x]` Milestone 5: Transcription + captions
- Transcription provider interface + mock/manual.
- `transcribe` and `captions` commands generate transcript/captions artifacts.

6. `[x]` Milestone 6: Quality gates
- `check` command implemented.
- Render blocks on failing quality checks unless forced.

7. `[x]` Milestone 7: MCP control server
- Base tool set implemented:
  - `lvstudio_list_projects`
  - `lvstudio_create_project`
  - `lvstudio_get_project_status`
  - `lvstudio_validate_project`
  - `lvstudio_resolve_config`
  - `lvstudio_sync_project`
  - `lvstudio_run_quality_checks`
  - `lvstudio_render_project`
  - `lvstudio_get_quality_report`
- Post-TTS/captions tools are now being added:
  - `lvstudio_generate_tts`
  - `lvstudio_transcribe_project`
  - `lvstudio_generate_captions`
  - `lvstudio_import_media`

8. `[x]` Milestone 8: Long documentary mode
- Documentary template and section title cards added.
- Export command writes chapters + description files.

9. `[~]` Milestone 9: Local UI
- `apps/studio` lightweight local UI scaffold added.
- Implemented:
  - project list
  - project status/details view
  - quality report panel
  - timeline/caption preview panels
  - render draft button wired to CLI
- Remaining:
  - editable video-plan form
  - richer media preview
  - persistent quality history

## Current Remaining Work

1. Add editable video-plan workflow to Studio UI.
2. Add media thumbnail/clip preview in Studio.
3. Add quality history/log persistence for Studio.

## Verification Commands

```bash
pnpm build
pnpm smoke
pnpm lvstudio status demo
pnpm mcp:server
```

## Notes

- Core owns workflow/data contracts; adapters own provider specifics.
- Remotion remains first renderer implementation, but architecture stays renderer-agnostic.
