# Renderer Agent Guide

`apps/renderer` owns Remotion compositions and render-time presentation.

## Boundaries

- Renderer code may depend on core types/contracts but should not own workflow, provider, or Studio server logic.
- Keep Remotion-specific logic here or in provider renderer adapters. Do not push Remotion imports into `packages/core` or `packages/cli`.
- Render components should consume prepared render bundles rather than reading arbitrary project files directly.

## Verification

- Visual/timeline behavior changes should include a render-bundle or renderer test where practical.
- Keep media path handling safe for local HTTP asset serving; avoid large data URLs for local media.
