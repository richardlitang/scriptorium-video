import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePlannerSelfReview,
  planNarrationHealth,
  plannerBlockingFailureMessage,
  plannerBlockingFailures,
  plannerProgressLabel,
  plannerQualityIsUsable,
  plannerQualityWarningSummary,
  plannerQualityWarnings,
} from "../lib/planner/planner-quality.mjs";

test("normalizePlannerSelfReview clamps and normalizes unknown values", () => {
  const normalized = normalizePlannerSelfReview({
    estimatedSourceCoverageRatio: 9,
    containsInventedChannelCta: "yes",
    introHookPlacement: "unknown",
    orderingConfidence: -2,
    coverageNotes: 123,
  });
  assert.deepEqual(normalized, {
    estimatedSourceCoverageRatio: 1,
    containsInventedChannelCta: false,
    introHookPlacement: "none",
    orderingConfidence: 0,
    coverageNotes: "123",
  });
});

test("planNarrationHealth computes ratio and quality signals from beats", () => {
  const metrics = planNarrationHealth(
    {
      sections: [
        {
          beats: [
            {
              narration: "replace this narration with your first beat",
              imageChangeDecision: "hold",
            },
            { narration: "A sudden reveal in the hallway.", imageChangeDecision: "change" },
          ],
        },
      ],
    },
    "A sudden reveal in the hallway over a tense night.",
    { estimatedSourceCoverageRatio: 0.5, introHookPlacement: "late_or_ending" },
  );

  assert.equal(metrics.beatCount, 2);
  assert.equal(metrics.placeholderHits, 1);
  assert.equal(metrics.changeDecisions, 1);
  assert.ok(metrics.ratio > 0);
  assert.equal(metrics.plannerSelfReview.introHookPlacement, "late_or_ending");
});

test("planner quality helpers produce blocking failures and warning summaries", () => {
  const metrics = {
    storyWords: 120,
    narrationWords: 40,
    ratio: 0.33,
    beatCount: 4,
    placeholderHits: 1,
    shortNarrationBeats: 2,
    plannerSelfReview: {
      estimatedSourceCoverageRatio: 0.45,
      containsInventedChannelCta: true,
      introHookPlacement: "late_or_ending",
      orderingConfidence: 0.42,
    },
  };
  const failures = plannerBlockingFailures(metrics);
  assert.equal(plannerQualityIsUsable(metrics), false);
  assert.match(failures.join("; "), /placeholder narration/);

  const warningText = plannerQualityWarningSummary(metrics);
  assert.match(warningText, /Planner review warnings:/);
  assert.match(warningText, /invented channel CTA/);
  assert.match(plannerBlockingFailureMessage(metrics), /Planner output is unusable/);
  assert.ok(plannerQualityWarnings(metrics).length >= 3);
});

test("plannerProgressLabel renders response and retryable error labels", () => {
  const responseLabel = plannerProgressLabel("Planning", {
    event: "request.response",
    model: "gpt-test",
  });
  assert.match(responseLabel, /response received/);

  const retryLabel = plannerProgressLabel("Planning", {
    event: "request.retryable_error",
    model: "gpt-test",
    elapsedMs: 12000,
  });
  assert.match(retryLabel, /error after 12s/);
});
