import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyDraftDefaults,
  isScaffoldPlaceholderPlan,
  parsePlanFromStoryInput,
  parseStoryForPlanner,
  buildPlannerStoryInput,
  plannerSplitDecision,
  resolveSplitPlannerConfig,
  splitStoryIntoLockedUnits,
} from "../lib/draft/draft-plan-input.mts";

test("parsePlanFromStoryInput returns plan objects and ignores plain prose", () => {
  const parsed = parsePlanFromStoryInput(
    JSON.stringify({
      schemaVersion: 1,
      sections: [{ id: "intro", beats: [] }],
    }),
  );
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(Array.isArray(parsed.sections), true);
  assert.equal(parsePlanFromStoryInput("This is plain prose, not JSON."), undefined);
});

test("isScaffoldPlaceholderPlan detects placeholder narration", () => {
  assert.equal(
    isScaffoldPlaceholderPlan({
      sections: [{ beats: [{ narration: "Replace this narration with your first beat." }] }],
    }),
    true,
  );
  assert.equal(
    isScaffoldPlaceholderPlan({
      sections: [{ beats: [{ narration: "Real narration." }] }],
    }),
    false,
  );
});

test("applyDraftDefaults enforces narration defaults and normalizes voice id", () => {
  const normalized = applyDraftDefaults({
    providers: { tts: "openai", transcription: "openai" },
    voice: { voiceId: "onyx", options: { language: "en" } },
  });
  assert.equal(normalized.providers.tts, "chatterbox");
  assert.equal(normalized.providers.transcription, "mock");
  assert.equal(normalized.voice.voiceId, "clone");
  assert.equal(normalized.voice.format, "wav");
  assert.equal(normalized.voice.options.speed, 0.92);
});

test("parseStoryForPlanner removes bracketed production cues from narration", () => {
  const parsed = parseStoryForPlanner(
    [
      "[BACKGROUND VISUAL: Slow pan across the room to the baby sister sleeping in a crib.]",
      "I looked at the crib and stopped breathing.",
      "[SFX: distant rain]",
      "Then the door opened. [CUT TO BLACK.]",
    ].join("\n"),
  );

  assert.deepEqual(parsed.narrationUnits, [
    "I looked at the crib and stopped breathing.",
    "Then the door opened.",
  ]);
  assert.equal(parsed.directives.length, 3);
  assert.equal(parsed.directives[0].kind, "visual");
  assert.equal(parsed.directives[1].kind, "sfx");
});

test("splitStoryIntoLockedUnits never returns standalone directives as narration", () => {
  const units = splitStoryIntoLockedUnits(
    "[LOW THUD. CUT TO BLACK.]\n\nThe hallway light blinked twice.",
  );
  assert.deepEqual(units, ["The hallway light blinked twice."]);
});

test("plannerSplitDecision defaults to single planner for manageable scripts", () => {
  const story = Array.from(
    { length: 20 },
    (_, index) => `Line ${index + 1} of normal narration.`,
  ).join("\n");
  const decision = plannerSplitDecision({}, story, {});
  assert.equal(decision.enabled, false);
  assert.equal(decision.reason, "below-threshold");
});

test("plannerSplitDecision enables split only past thresholds or explicit mode", () => {
  const longStory = Array.from(
    { length: 41 },
    (_, index) => `Line ${index + 1} of normal narration.`,
  ).join("\n");
  assert.equal(plannerSplitDecision({}, longStory, {}).enabled, true);
  assert.equal(plannerSplitDecision({ plannerMode: "single" }, longStory, {}).enabled, false);
  assert.equal(
    plannerSplitDecision({ plannerMode: "split" }, "Short narration.", {}).enabled,
    true,
  );
});

test("resolveSplitPlannerConfig normalizes env settings", () => {
  assert.deepEqual(
    resolveSplitPlannerConfig({
      LVSTUDIO_SPLIT_PLANNER: "0",
      LVSTUDIO_SPLIT_PLANNER_MIN_WORDS: "3000",
      LVSTUDIO_SPLIT_PLANNER_MIN_UNITS: "50",
    }),
    { enabled: false, minWords: 3000, minUnits: 50 },
  );
  assert.deepEqual(
    resolveSplitPlannerConfig({
      LVSTUDIO_SPLIT_PLANNER_MIN_WORDS: "bad",
      LVSTUDIO_SPLIT_PLANNER_MIN_UNITS: "0",
    }),
    { enabled: true, minWords: 2500, minUnits: 40 },
  );
});

test("buildPlannerStoryInput separates spoken narration from directives", () => {
  const input = buildPlannerStoryInput("[BACKGROUND VISUAL: rain]\nThe room went cold.");
  assert.match(input, /SPOKEN NARRATION/);
  assert.match(input, /The room went cold/);
  assert.match(input, /PRODUCTION DIRECTIVES/);
  assert.match(input, /visual: BACKGROUND VISUAL: rain/);
  assert.doesNotMatch(input.split("PRODUCTION DIRECTIVES")[0], /BACKGROUND VISUAL/);
});
