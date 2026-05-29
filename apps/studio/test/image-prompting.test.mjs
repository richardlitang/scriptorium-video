import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultImageSizeForPlan, imageTargetsFromPlan } from "../lib/image/image-prompting.mjs";

test("defaultImageSizeForPlan returns mode-specific defaults", () => {
  assert.equal(defaultImageSizeForPlan({ mode: "short_story" }), "1024x1536");
  assert.equal(defaultImageSizeForPlan({ mode: "long_documentary" }), "1536x1024");
});

test("imageTargetsFromPlan builds primary visual targets per beat", () => {
  const plan = {
    mode: "long_documentary",
    title: "Demo",
    targetPlatform: "local_only",
    sections: [
      {
        id: "s1",
        title: "Intro",
        beats: [
          { id: "b1", narration: "One", visual: { referenceIds: [] }, media: [] },
          { id: "b2", narration: "Two", visual: { referenceIds: [] }, media: [] },
        ],
      },
    ],
    visualBible: {},
  };
  const targets = imageTargetsFromPlan(plan);
  assert.equal(targets.length, 2);
  assert.deepEqual(
    targets.map((t) => t.assetId),
    ["image-b1", "image-b2"],
  );
});
