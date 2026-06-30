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

test("imageTargetsFromPlan falls back to relevant anchors when beat has no referenceIds", () => {
  const plan = {
    mode: "short_story",
    title: "T",
    targetPlatform: "local_only",
    visualBible: {
      characters: [{ id: "c1", name: "Mara", hair: "red braid" }],
      locations: [{ id: "l1", name: "Inn", description: "mossy roof" }],
      objects: [],
    },
    sections: [
      {
        id: "s1",
        title: "S",
        beats: [
          {
            id: "b1",
            order: 1,
            narration: "Mara steps into the Inn.",
            visual: { prompt: "Mara at the inn", referenceIds: [] },
          },
        ],
      },
    ],
  };
  const targets = imageTargetsFromPlan(plan);
  const ids = targets[0].references.map((r) => r.id).sort();
  assert.ok(ids.includes("c1"), "should pick the Mara character anchor by name match");
});
