import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLegacyBibleProse } from "../dist/legacy-bible-prose.js";

test("flags beats that still embed the legacy bible prose", () => {
  const plan = {
    sections: [
      {
        id: "s1",
        beats: [
          { id: "b1", notes: "Character bible: Mara role=lead ...", media: [] },
          { id: "b2", notes: "clean note", media: [{ prompt: "clean prompt" }] },
        ],
      },
    ],
  };
  const warnings = detectLegacyBibleProse(plan);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /b1/);
});

test("returns no warnings for a lean plan", () => {
  const plan = {
    sections: [{ id: "s1", beats: [{ id: "b1", notes: "n", media: [{ prompt: "p" }] }] }],
  };
  assert.deepEqual(detectLegacyBibleProse(plan), []);
});
