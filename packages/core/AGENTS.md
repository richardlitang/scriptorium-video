# Core Agent Guide

`packages/core` is the domain and workflow foundation for Local Video Studio.

## Ownership

- Core owns schemas, project paths, normalization/migration, sync, captions, TTS orchestration contracts, render bundle building, review logic, and provider interfaces.
- Core must not import Remotion, Studio server code, browser UI code, or concrete provider clients.
- Core should avoid direct `process.env` reads except in explicit config/key-resolution helpers designed for that purpose.

## Schemas And Migration

- Zod schemas in `src/schemas` are the canonical data model.
- When changing a schema, update normalization, migrations, review/quality warnings, and tests in the same slice.
- Legacy fields should be normalized at load/migration boundaries and should not spread into new planner/provider contracts.
- Prefer canonical fields in new code; compatibility fallbacks should be isolated and tested.

## Tests

- Core behavior changes require package-local tests under `test/`.
- Path-safety, schema, migration, and render-bundle changes require tests that exercise invalid as well as valid inputs.
