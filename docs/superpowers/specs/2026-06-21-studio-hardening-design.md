# Studio Hardening Design

**Goal:** Finish the Studio boundary migration without regressing the already-merged typed domain operations, then reduce the warning baseline with mechanically enforced progress.

## Preserved baseline

`main` at merge commit `b17257a` is the source of truth. It already contains the incremental TypeScript seam, canonical OpenAI key resolution, typed safe domain operations, constrained voice subprocess calls, and grouped route capabilities. Every hardening change starts from this state and retains the public HTTP contracts guarded by existing route tests.

The unmerged `studio-architecture-remediation` branch is not merged wholesale. It was based on an older snapshot, defines a competing domain-operations adapter, and would reintroduce legacy `.mjs` files that `main` has replaced. It remains a read-only reference until any individually useful, test-backed idea is reimplemented from current `main`.

## Track A: Explicit voice runtime configuration

Move Chatterbox and TTS runtime settings from child-process environment injection into an explicit provider configuration object. The configuration is assembled by Studio from persisted voice settings, passed through the typed TTS operation, and consumed only by the selected provider. Each call owns its config object; no operation mutates or reads global `process.env` after runtime configuration has been resolved.

`generate:tts`, `transcribe`, and `direct:voice` remain on the narrow subprocess boundary until their complete explicit-config paths have tests. Migration happens one command family at a time and preserves queue ownership, cancellation, and result contracts.

## Track B: Strongly typed route capabilities

Replace the current capability member `unknown` values with concrete TypeScript contracts derived from Studio-owned operation modules and Node request/response types. Route modules move to `.mts` only when their capability interfaces are complete; handlers remain thin adapters that validate, call an operation, and map the result.

The runtime factory remains composition-only. Capability construction belongs in focused factory modules if it would otherwise grow the server factory.

## Track C: Incremental Studio TypeScript migration

Continue `.mjs` to `.mts` conversion from leaf modules toward coordinators, with no behavior changes in rename-only slices. The order is: draft/planner leaves, image and TTS leaves, project operations, routes, runtime wiring, then server entrypoint. Every migrated module gets explicit exported contracts and tests for extracted pure behavior.

## Track D: Warning-baseline ratchet

Do not suppress warnings or raise the current limit. Fix warnings in small ownership-aligned slices, beginning with Studio files that are already being touched by Tracks A-C. Each slice lowers `--max-warnings` to the newly observed total, so a fixed warning cannot silently return. Renderer, packages, and UI complexity work are separate follow-up slices after Studio server risk is reduced.

## Validation and branch policy

Every behavior change follows red-green-refactor and runs focused tests before implementation. Each logical slice runs its package tests and `pnpm -s verify` before commit. Before integration, rebase the fresh hardening branch on `main`, rerun the full gate, and inspect the diff for generated artifacts, route-contract drift, and accidental subprocess expansion.
