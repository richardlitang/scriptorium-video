import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildPlannerStoryInput,
  parseStoryForPlanner,
  plannerSplitDecision,
  splitStoryIntoLockedUnits,
} from "../lib/draft/draft-plan-input.mts";

const fixturePath = new URL("./fixtures/planner-regression-cases.json", import.meta.url);
const messyScripts = JSON.parse(await readFile(fixturePath, "utf8"));

test("planner eval: production cues are metadata, not spoken narration", () => {
  for (const fixture of messyScripts) {
    const parsed = parseStoryForPlanner(fixture.story);
    const narration = parsed.narrationUnits.join(" ");
    assert.doesNotMatch(
      narration,
      /\bBACKGROUND VISUAL\b|\bSFX\b|\bCUT TO BLACK\b|\bSMASH CUT\b|\bLOW THUD\b/i,
      fixture.name,
    );
    assert.ok(
      parsed.narrationUnits.every((unit) => unit.trim().length > 0),
      fixture.name,
    );
  }
});

test("planner eval: LLM payload separates narration from directives", () => {
  const payload = buildPlannerStoryInput(messyScripts[0].story);
  const spokenBlock = payload.split("PRODUCTION DIRECTIVES")[0];
  assert.match(payload, /PRODUCTION DIRECTIVES/);
  assert.doesNotMatch(spokenBlock, /BACKGROUND VISUAL|LOW THUD|CUT TO BLACK/i);
  assert.match(payload, /visual: BACKGROUND VISUAL/);
  assert.match(payload, /sfx: LOW THUD/);
});

test("planner eval: manageable scripts do not trigger split planner by default", () => {
  const decision = plannerSplitDecision({}, messyScripts[2].story, {});
  assert.equal(decision.enabled, false);
  assert.equal(splitStoryIntoLockedUnits(messyScripts[2].story).length, 30);
});
