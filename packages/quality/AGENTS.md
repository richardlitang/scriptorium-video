# Quality Agent Guide

`packages/quality` owns read-only checks and reports.

## Tooling Baseline

- Follow repo-level **Bootstrap Quality Tooling (Mandatory)** in `AGENTS.md` for any new quality workspace/bootstrap work.

## Boundaries

- Quality checks must not mutate project artifacts.
- Quality may depend on core loading/building APIs, but should not call Studio route/server code.
- Findings should be deterministic and include enough path/beat/section data for a user or agent to fix the issue.

## Checks

- Add quality checks when a migration or architectural cleanup needs observability before enforcement.
- Prefer warning-first checks for legacy compatibility issues, then tighten validation after data has been migrated.
- Tests should assert finding ids, severity, and key metadata, not only count totals.
