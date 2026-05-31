# Providers Agent Guide

`packages/providers` owns concrete integrations for TTS, renderer adapters, and other external services.

## Tooling Baseline

- Follow repo-level **Bootstrap Quality Tooling (Mandatory)** in `AGENTS.md` for any new providers workspace/bootstrap work.

## Boundaries

- Providers depend on core contracts; they should not depend on Studio server internals or CLI command wiring.
- Provider modules should expose small adapter surfaces and keep request/response normalization local.
- Renderer-specific dependencies, including Remotion, stay in provider renderer adapters or `apps/renderer`.

## Reliability

- External calls should accept injectable clients or process wrappers where practical.
- Error messages should be actionable and avoid raw unhandled stacks for expected setup/runtime failures.
- Provider behavior changes need tests for success shape and actionable failure behavior.
