import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPlannerStoryInput,
  parseStoryForPlanner,
  plannerSplitDecision,
  splitStoryIntoLockedUnits,
} from "../lib/draft/draft-plan-input.mjs";

const messyScripts = [
  {
    name: "nuno-style bracketed visual cues",
    story: [
      "[BACKGROUND VISUAL: Black screen. SFX: Crickets, distant rain.]",
      "My cousins told me not to look under the bed.",
      "[LOW THUD. CUT TO BLACK.]",
      "But I heard something breathing there.",
    ].join("\n"),
  },
  {
    name: "inline production cue",
    story: "The candle went out. [SMASH CUT TO BLACK.] Then my sister whispered my name.",
  },
  {
    name: "manageable multi-line script",
    story: Array.from(
      { length: 30 },
      (_, index) => `Narration line ${index + 1} keeps the story moving.`,
    ).join("\n"),
  },
];

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
