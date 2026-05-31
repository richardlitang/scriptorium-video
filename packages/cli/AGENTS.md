# CLI Agent Guide

`packages/cli` owns command parsing, command UX, and command wiring.

## Tooling Baseline

- Follow repo-level **Bootstrap Quality Tooling (Mandatory)** in `AGENTS.md` for any new CLI workspace/bootstrap work.

## Boundaries

- Reusable workflow logic belongs in `packages/core`, `packages/providers`, or `packages/quality`, not directly in CLI commands.
- CLI commands should translate user intent into core/provider/quality calls and present actionable output.
- Do not import Studio server code or renderer app code.

## Behavior

- Expected setup failures should print concise actionable messages without uncaught stacks.
- Command changes need tests for success behavior and user-facing failure output when practical.
- Migration commands should support dry-run behavior before destructive writes.
