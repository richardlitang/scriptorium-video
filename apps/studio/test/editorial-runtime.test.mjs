import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeVisualCueAt,
  shouldCutToBlack,
  visualCueStyle,
} from "../../renderer/dist/templates/editorialHelpers.js";

test("editorial runtime prioritizes next_visual cues and ignores black-target cues for active visual effects", () => {
  const cues = [
    {
      type: "push_in",
      startSeconds: 0,
      durationSeconds: 2,
      target: "current_visual",
      intensity: 0.3,
    },
    {
      type: "hard_cut",
      startSeconds: 0,
      durationSeconds: 2,
      target: "next_visual",
      intensity: 0.2,
    },
    { type: "smash_cut", startSeconds: 0, durationSeconds: 2, target: "black", intensity: 1 },
  ];
  const active = activeVisualCueAt(0.5, cues);
  assert.equal(active?.target, "next_visual");
  assert.equal(active?.type, "hard_cut");
});

test("editorial runtime visualCueStyle applies push-in and cut styles", () => {
  const pushInStyle = visualCueStyle(
    {
      type: "push_in",
      startSeconds: 0,
      durationSeconds: 1,
      target: "current_visual",
      intensity: 1,
    },
    0.5,
  );
  assert.ok(String(pushInStyle.transform || "").includes("scale("));

  const cutStyle = visualCueStyle(
    {
      type: "smash_cut",
      startSeconds: 0,
      durationSeconds: 1,
      target: "current_visual",
      intensity: 0.8,
    },
    0.1,
  );
  assert.ok(String(cutStyle.filter || "").includes("contrast("));
});

test("editorial runtime applies cut-to-black windows only for black-target cut cues", () => {
  const cues = [
    { type: "cut_to_black", startSeconds: 1, durationSeconds: 1, target: "black", intensity: 1 },
    { type: "hold_black", startSeconds: 3, durationSeconds: 2, target: "black", intensity: 1 },
    {
      type: "cut_to_black",
      startSeconds: 5,
      durationSeconds: 1,
      target: "current_visual",
      intensity: 1,
    },
  ];

  assert.equal(shouldCutToBlack(1.5, cues), true);
  assert.equal(shouldCutToBlack(3.5, cues), true);
  assert.equal(shouldCutToBlack(5.5, cues), false);
});
