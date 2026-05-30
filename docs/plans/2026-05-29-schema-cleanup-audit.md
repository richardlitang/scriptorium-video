# Schema Cleanup Audit & Recommendations

**Date:** 2026-05-29
**Status:** Audit — no code changes yet. Review before any refactor.
**Scope:** `packages/core/src/schemas/*`, the LLM draft contract, and the front/back type boundary.

## TL;DR

The schemas are **not bloated with dead fields** — every field I traced is consumed by a
real reader (normalizer, resolver, transformer, render-bundle, or timeline). The "noise" the
request is really about is two different things:

1. **Dual representations of the same concept** carried for legacy/migration reasons
   (`*Ms` vs `*Seconds` pauses; top-level `beat.*` vs `beat.direction.*`). These are
   intentional and guarded, but they're the main source of "two ways to say the same thing."
2. **No shared types across the front/back boundary.** The React app types every server
   response as `unknown` and casts. This is the single highest-value fix and is cheap.

There is also a hand-maintained ~400-line JSON Schema (`plan-draft.schema.mjs`) that duplicates
shape information held in Zod — a real duplication, but a deliberate one (different consumer,
different shape). Worth a decision, not an obvious delete.

---

## 1. Inventory — what each schema is and whether it's load-bearing

| Schema file                     | Role                                                                                                | Verdict                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `video-plan.schema.ts` (386 L)  | Canonical domain model (Zod). Source of truth per AGENTS.md.                                        | Keep. Has internal duplication — see §3.              |
| `plan-draft.schema.mjs` (398 L) | LLM structured-output contract (plain JSON Schema, flat shape). Normalized into the canonical plan. | Keep, but a duplication-reduction candidate — see §4. |
| `timeline.schema.ts` (158 L)    | Render-time timeline + named enums (`ScaleMode`, etc.).                                             | Keep. Enums are correctly centralized here.           |
| `asset-manifest.schema.ts`      | Asset manifest + source/license/audio-processing.                                                   | Keep. All fields consumed.                            |
| `captions.schema.ts`            | Caption file + word timings.                                                                        | Keep.                                                 |
| `transcript.schema.ts`          | Transcript file.                                                                                    | Keep.                                                 |
| `project.schema.ts`             | Project status record.                                                                              | Keep.                                                 |
| `quality-report.schema.ts`      | Quality findings.                                                                                   | Keep.                                                 |
| `voice-director.schema.ts`      | Voice-director output.                                                                              | Keep. Reuses `video-plan` schemas — good.             |

**Finding A — no genuinely dead fields.** I traced the draft schema's "suspicious" beat fields
(`lens`, `composition`, `subjectContinuity`, `cameraDistance`, `negativePromptAdditions`,
`referenceIds`, `referencePriority`, `shotType`, `lighting`, `visualConfidence`,
`voiceConfidence`, `imageChangeDecision`) — every one has 4–7 references in the draft
transformer / core. Nothing to delete here.

**Finding B — apparent VisualBible "drift" is intentional.** The Zod `VisualBibleSchema` lacks
`characters` / `locations` / `objects` that the JSON-Schema draft requires. That's not drift:
the draft's richer bible is collapsed into prompt strings by `plan-draft-transformer.mjs`
_before_ it becomes a canonical plan. Document this so it isn't "fixed" by accident.

---

## 2. The real noise #1 — legacy `*Ms` pause fields

`VoiceDirectionSchema` / `VoiceDirectionOverrideSchema` carry **both**:

- `pauseBeforeMs` / `pauseAfterMs` (legacy, milliseconds)
- `pauseBeforeSeconds` / `pauseAfterSeconds` (canonical, seconds)

There is already a `canonicalizeVoicePauseFields` normalizer, a `voice-pauses.ts` helper that
reads ms as a fallback, and a `pause-seconds-boundary` check. So ms is mid-migration.

**Recommendation:** keep ms only at the load/normalize boundary; remove it from the _emitted_
contract (the draft schema and any writer) so new data is seconds-only. Full removal from the
domain schema is gated on: no stored project still carrying ms-only values. Add a one-shot audit
(or extend the existing quality warning) that counts ms-only beats; remove the field once that
count is zero across `.studio-data`.

---

## 3. The real noise #2 — top-level `beat.*` vs `beat.direction.*`

`BeatSchema` exposes `motion`, `voiceDirection`, `sfxCues`, `editorial`, `visual` **both** as
top-level beat fields **and** inside `direction` (`ProductionDirectionSchema`). This is the
strongest "two ways to say the same thing" smell.

It is, however, **managed legacy**, not an accident:

- `resolve-production-direction.ts` reads a precedence chain
  `beat.direction.X → section.direction.X → plan.direction.X → beat.X (legacy)`.
- `plan-legacy-fields.ts` explicitly tracks `voiceDirection | sfxCues | editorial` as legacy
  beat fields and surfaces usage counts.
- `normalize-video-plan.ts` migrates top-level → `direction`.

**Recommendation:** this is the highest-value _schema_ simplification, but it must be staged:

1. Confirm `normalize-video-plan` always lifts legacy top-level fields into `direction`.
2. Confirm no writer still emits top-level (planner/draft transformer, direct-voice, sync).
3. Use `plan-legacy-fields` counts as the removal gate; when zero across stored projects,
   drop the top-level fields from `BeatSchema` and delete the fallback arms in the resolver.
   `beat.motion` is the trickiest (it has a non-trivial default) — treat it last.

Net effect: `BeatSchema` loses ~5 redundant fields and the resolver loses its legacy arms.

---

## 4. The 400-line hand-maintained draft JSON Schema

`plan-draft.schema.mjs` is plain JSON Schema (not Zod) because OpenAI structured output needs
JSON Schema with all-fields-required. It is genuinely a _different shape_ from the canonical
plan (flat beats; LLM-facing field names like `voiceProfile`, `imageChangeDecision`). It's
guarded by `check-planner-schema-boundary`.

Two options:

- **(Recommended) Leave the shape, stop hand-maintaining it.** Define the draft as its own Zod
  schema in core and generate the JSON Schema via `zod-to-json-schema` (forcing
  `additionalProperties:false` + all-required, which OpenAI needs). One source, derived
  artifact, boundary check updated to assert "generated, not hand-edited." Removes ~400 lines
  of hand-maintained JSON.
- **Leave as-is.** It works and is checked. Cost: every draft-shape change is edited by hand in
  two mental models (JSON Schema here, transformer expectations downstream).

This is a judgment call about appetite, not an obvious win — flagged for your decision.

---

## 5. The real win — one source of types for front + back

Today `apps/studio/web/src` shares **nothing** with core:

- `api/client.ts` returns `unknown`; queries do `as unknown as { data?: ... }`.
- The plan is typed `unknown`; planner/tts/assets queries hand-roll loose inline types.
- `apps/studio/package.json` has **no dependency on `@lvstudio/core`**, and core only ships
  from `dist`.

The domain Zod model and the LLM JSON-Schema draft can't collapse into one schema (different
consumers, different shapes). But the **types** absolutely can be shared, and that's the
"single source for front and backend" the request is after.

**Recommendation:**

1. Add `@lvstudio/core` as a workspace dependency of `apps/studio`.
2. In the web app, use **type-only** imports: `import type { VideoPlan, Beat, Timeline } from "@lvstudio/core"`.
   Types erase at compile time, so **no Zod and no schema code enters the browser bundle** —
   zero runtime cost.
3. Type `api/client.ts` responses against a small shared response envelope + the core types,
   replacing the `as unknown` casts.
4. (Optional, later) For inputs the UI submits and wants to validate client-side, import the
   actual Zod schema and `safeParse` — opt-in per form, not blanket.

This removes the largest source of "noise/inconsistency" (frontend drift from the real model)
without merging the two backend schemas.

---

## Recommended sequencing (each its own slice + verify)

1. **Front/back type sharing** (§5) — highest value, lowest risk, no domain-schema change.
2. **ms pause removal from emitters** (§2) — stop writing legacy; keep read fallback.
3. **Draft schema: generate from Zod** (§4) — only if appetite; removes ~400 hand-maintained lines.
4. **Collapse top-level beat fields** (§3) — last, gated on `plan-legacy-fields` counts hitting zero.

## What I am explicitly _not_ recommending

- Deleting any field that still has readers (none found to be dead).
- Merging the canonical plan and the LLM draft into one schema.
- "Fixing" the VisualBible characters/locations/objects difference (intentional — §1, Finding B).
