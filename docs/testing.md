# Testing Strategy

This repo uses package-owned test scripts. The root `pnpm verify` command composes package checks.

## Package Test Ownership

- Each package/app with tests should define its own `test` script.
- Root `pnpm test` runs package tests recursively with `pnpm -r --if-present test`.

## Dist Import Contract

Many package tests intentionally import built artifacts from `dist` to verify emitted runtime behavior.

If a package test imports from `dist`, that package `test` script must compile first, for example:

```json
{
  "scripts": {
    "test": "pnpm -s exec tsc -p tsconfig.json && node --test \"test/**/*.mjs\""
  }
}
```

Rationale:

- Prevent stale build artifacts from causing false test failures.
- Ensure package-local test runs are deterministic without requiring a prior root build.

This rule is enforced by `scripts/check-test-dist-contract.mjs` and runs inside `pnpm verify`.

## Architecture Guardrails In Verify

`pnpm verify` also enforces architecture and migration boundaries:

- `scripts/check-renderer-boundary.sh`:
  ensures `packages/core` and `packages/cli` do not import renderer-specific Remotion code.
- `scripts/check-pause-seconds-boundary.mjs`:
  prevents new `pauseBeforeSeconds` / `pauseAfterSeconds` source usage outside the explicit legacy-compat allowlist.
- `scripts/check-studio-server-bootstrap.mjs`:
  keeps `apps/studio/server.mjs` as a thin bootstrap entrypoint and blocks runtime-assembly logic from drifting back into that file.
- `scripts/check-planner-schema-boundary.mjs`:
  keeps planner-draft JSON schema ownership in `packages/core/src/schemas/plan-draft.schema.mjs` and blocks inlining schema definitions back into Studio orchestrators.
- `scripts/check-video-plan-normalization.mjs`:
  enforces normalized `video-plan.json` read boundaries in `packages/core/src` so runtime workflows do not consume legacy voice fields without canonicalization.
- `scripts/check-studio-env-boundary.mjs`:
  blocks new direct `process.env` reads in Studio runtime/server code so environment access stays centralized through runtime config helpers.
