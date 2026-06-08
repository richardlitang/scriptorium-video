import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQualityRepairPlan } from "../dist/quality-repair-plan.js";

test("buildQualityRepairPlan maps structured quality findings to bounded repair actions", () => {
  const plan = buildQualityRepairPlan({
    status: "fail",
    checks: [
      {
        id: "shared.timeline.hash",
        severity: "info",
        message: "timeline exists",
      },
      {
        id: "shared.beat.voice",
        severity: "error",
        message: "Beat b1 has no voiceover asset.",
        sectionId: "s1",
        beatId: "b1",
      },
      {
        id: "shared.beat.voice",
        severity: "error",
        message: "Beat b1 still has no voiceover asset.",
        sectionId: "s1",
        beatId: "b1",
      },
      {
        id: "shared.narration.production_directive",
        severity: "error",
        message: "Beat b2 contains a bracketed production direction inside spoken narration.",
        sectionId: "s1",
        beatId: "b2",
        path: "video-plan.sections.s1.beats.b2.narration",
      },
      {
        id: "shared.voice.pause_budget",
        severity: "warning",
        message: "Beat b3 has high combined pause budget.",
        sectionId: "s1",
        beatId: "b3",
        data: { pausesSeconds: 1.8 },
      },
    ],
  });

  assert.equal(plan.status, "needs_repair");
  assert.equal(plan.actions.length, 3);
  assert.deepEqual(
    plan.actions.map((action) => action.kind),
    ["generate_tts", "rewrite_narration", "adjust_voice_direction"],
  );
  assert.deepEqual(plan.actions[0], {
    kind: "generate_tts",
    severity: "error",
    sectionId: "s1",
    beatId: "b1",
    reason: "Beat b1 has no voiceover asset.",
  });
  assert.equal(plan.actions[1].path, "video-plan.sections.s1.beats.b2.narration");
  assert.equal(plan.actions[2].data.pausesSeconds, 1.8);
  assert.deepEqual(plan.blockedFindings, []);
});

test("buildQualityRepairPlan blocks unknown errors for explicit review", () => {
  const plan = buildQualityRepairPlan({
    status: "fail",
    checks: [
      {
        id: "shared.future.unknown",
        severity: "error",
        message: "A future hard failure exists.",
        path: "video-plan.sections.s1",
      },
    ],
  });

  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.blockedFindings, [
    {
      id: "shared.future.unknown",
      severity: "error",
      message: "A future hard failure exists.",
      path: "video-plan.sections.s1",
    },
  ]);
});

test("buildQualityRepairPlan reports no-op for passing reports", () => {
  const plan = buildQualityRepairPlan({
    status: "pass",
    checks: [{ id: "shared.timeline.hash", severity: "info", message: "ok" }],
  });

  assert.equal(plan.status, "no_repair_needed");
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.blockedFindings, []);
});
