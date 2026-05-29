import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDirectionWithLocks } from "../lib/draft/direction-lock-merge.mjs";

test("mergeDirectionWithLocks preserves fully locked creative direction", () => {
  const result = mergeDirectionWithLocks(
    { creative: { feel: "old", pacing: "old", visualStyle: "old" } },
    { lockedPaths: ["creative"], sources: { creative: "user" } },
    { creative: { feel: "new", pacing: "new", visualStyle: "new" } },
    { creative: "llm" },
  );
  assert.deepEqual(result.direction.creative, { feel: "old", pacing: "old", visualStyle: "old" });
  assert.equal(result.directionMeta.sources.creative, "llm");
});

test("mergeDirectionWithLocks preserves selectively locked caption fields", () => {
  const result = mergeDirectionWithLocks(
    { caption: { emphasis: ["keep"], style: "old", tuning: { targetMaxWords: 12 } } },
    { lockedPaths: ["caption.emphasis", "caption.tuning"], sources: { caption: "user" } },
    { caption: { emphasis: ["drop"], style: "new", tuning: { targetMaxWords: 22 } } },
    { caption: "llm" },
  );
  assert.deepEqual(result.direction.caption.emphasis, ["keep"]);
  assert.deepEqual(result.direction.caption.tuning, { targetMaxWords: 12 });
  assert.equal(result.direction.caption.style, "new");
});

test("mergeDirectionWithLocks preserves locked sfx and editorial", () => {
  const result = mergeDirectionWithLocks(
    {
      sfxCues: [{ id: "old-sfx" }],
      editorial: { visualEditCues: [{ id: "old-edit" }], silenceWindows: [] },
    },
    { lockedPaths: ["sfx", "editorial"], sources: {} },
    {
      sfxCues: [{ id: "new-sfx" }],
      editorial: { visualEditCues: [{ id: "new-edit" }], silenceWindows: [] },
    },
    { sfx: "llm", editorial: "llm" },
  );
  assert.deepEqual(result.direction.sfxCues, [{ id: "old-sfx" }]);
  assert.deepEqual(result.direction.editorial, {
    visualEditCues: [{ id: "old-edit" }],
    silenceWindows: [],
  });
});
